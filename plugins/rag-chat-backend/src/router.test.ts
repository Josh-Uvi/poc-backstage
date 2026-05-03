import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { ConversationService } from './services/ConversationService';
import { ILlmService } from './services/llm/LlmService';
import { IRagService } from './services/rag/RagService';

describe('createRouter', () => {
  let app: express.Express;
  let conversations: jest.Mocked<ConversationService>;
  let llm: jest.Mocked<ILlmService>;
  let rag: jest.Mocked<IRagService>;

  const mockConversation = {
    id: 'conv-1',
    title: 'Test conversation',
    userRef: mockCredentials.user().principal.userEntityRef,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockLlmResponse = {
    content: 'This is an assistant response.',
    modelId: 'gpt-4',
  };

  beforeEach(async () => {
    conversations = {
      listConversations: jest.fn(),
      listConversationSources: jest.fn().mockResolvedValue([]),
      addConversationSource: jest.fn(),
      upsertConversation: jest.fn(),
      deleteConversation: jest.fn(),
    } as any;

    llm = {
      chat: jest.fn().mockResolvedValue(mockLlmResponse),
      stream: jest.fn().mockImplementation(async function* () {
        yield 'This ';
        yield 'is ';
        yield 'an assistant response.';
      }),
    };
    rag = {
      indexSource: jest.fn().mockResolvedValue(undefined),
      indexDocument: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue([]),
    };

    const router = await createRouter({
      httpAuth: mockServices.httpAuth(),
      conversations,
      llm,
      rag,
    });
    app = express();
    app.use(router);
    app.use(mockErrorHandler());
  });

  describe('POST /chat', () => {
    it('should stream an assistant response as SSE', async () => {
      conversations.upsertConversation.mockResolvedValue(mockConversation);
      conversations.listConversations.mockResolvedValue([mockConversation]);

      const response = await request(app).post('/chat').send({
        message: 'Hello',
        modelId: 'gpt-4',
        conversationId: 'conv-1',
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
      expect(response.text).toContain('"type":"token"');
      expect(response.text).toContain('"type":"done"');
      expect(response.text).toContain('"conversationId":"conv-1"');
      expect(llm.stream).toHaveBeenCalledWith('gpt-4', expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'user', content: 'Hello' }]),
      }));
    });

    it('should call RAG retrieve when sourceIds are provided', async () => {
      conversations.upsertConversation.mockResolvedValue(mockConversation);
      conversations.listConversations.mockResolvedValue([mockConversation]);
      conversations.listConversationSources.mockResolvedValue([]);
      rag.retrieve.mockResolvedValue([
        { text: 'Backstage is a platform.', metadata: { sourceId: 'catalog', ref: 'component:default/my-app' } },
      ]);

      const response = await request(app).post('/chat').send({
        message: 'What is Backstage?',
        modelId: 'gpt-4',
        conversationId: 'conv-1',
        sourceIds: ['catalog'],
      });

      expect(response.status).toBe(200);
      expect(rag.indexSource).toHaveBeenCalledWith('catalog', expect.anything());
      expect(rag.retrieve).toHaveBeenCalledWith('What is Backstage?', ['catalog'], 5);
      expect(llm.stream).toHaveBeenCalledWith('gpt-4', expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'assistant', content: expect.stringContaining('Backstage is a platform.') }),
        ]),
      }));
    });

    it('should create a new conversation when no conversationId is provided', async () => {
      conversations.upsertConversation.mockResolvedValue(mockConversation);
      conversations.listConversations.mockResolvedValue([mockConversation]);
      conversations.listConversationSources.mockResolvedValue([]);

      const response = await request(app).post('/chat').send({
        message: 'Hello',
        modelId: 'gpt-4',
      });

      expect(response.status).toBe(200);
      expect(conversations.upsertConversation).toHaveBeenCalled();
    });

    it('should reject invalid input', async () => {
      const response = await request(app).post('/chat').send({ message: '' });
      expect(response.status).toBe(400);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .post('/chat')
        .set('Authorization', mockCredentials.none.header())
        .send({ message: 'Hello', modelId: 'gpt-4' });
      expect(response.status).toBe(401);
    });

    it('should include uploaded conversation sources in retrieval', async () => {
      conversations.upsertConversation.mockResolvedValue(mockConversation);
      conversations.listConversations.mockResolvedValue([mockConversation]);
      conversations.listConversationSources.mockResolvedValue([
        {
          id: 'upload-1',
          conversationId: 'conv-1',
          sourceId: 'upload:conv-1:upload-1',
          fileName: 'notes.txt',
          createdAt: new Date().toISOString(),
        },
      ]);

      const response = await request(app).post('/chat').send({
        message: 'Use my upload',
        modelId: 'gpt-4',
        conversationId: 'conv-1',
      });

      expect(response.status).toBe(200);
      expect(rag.retrieve).toHaveBeenCalledWith(
        'Use my upload',
        ['upload:conv-1:upload-1'],
        5,
      );
    });
  });

  describe('POST /upload', () => {
    it('should extract and index uploaded files for a conversation', async () => {
      conversations.listConversations.mockResolvedValue([mockConversation]);
      conversations.addConversationSource.mockImplementation(async input => ({
        id: input.id ?? 'upload-1',
        conversationId: input.conversationId,
        sourceId: input.sourceId,
        fileName: input.fileName,
        contentType: input.contentType,
        createdAt: new Date().toISOString(),
      }));

      const response = await request(app)
        .post('/upload')
        .field('conversationId', 'conv-1')
        .attach('file', Buffer.from('hello from upload'), 'notes.txt');

      expect(response.status).toBe(201);
      expect(rag.indexDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: expect.stringContaining('upload:conv-1:'),
          documentText: 'hello from upload',
          metadata: expect.objectContaining({
            conversationId: 'conv-1',
            fileName: 'notes.txt',
          }),
        }),
      );
      expect(conversations.addConversationSource).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          fileName: 'notes.txt',
        }),
        mockCredentials.user().principal.userEntityRef,
      );
      expect(response.body.source.fileName).toBe('notes.txt');
    });

    it('should require a conversationId for uploads', async () => {
      const response = await request(app)
        .post('/upload')
        .attach('file', Buffer.from('hello from upload'), 'notes.txt');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /conversations', () => {
    it('should return conversations for the user', async () => {
      conversations.listConversations.mockResolvedValue([mockConversation]);

      const response = await request(app).get('/conversations');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [mockConversation] });
    });

    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/conversations')
        .set('Authorization', mockCredentials.none.header());
      expect(response.status).toBe(401);
    });
  });

  describe('POST /conversations', () => {
    it('should create a new conversation', async () => {
      conversations.upsertConversation.mockResolvedValue(mockConversation);

      const response = await request(app)
        .post('/conversations')
        .send({ title: 'Test conversation' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockConversation);
    });

    it('should update an existing conversation', async () => {
      conversations.upsertConversation.mockResolvedValue(mockConversation);

      const response = await request(app)
        .post('/conversations')
        .send({ id: 'conv-1', title: 'Updated title' });

      expect(response.status).toBe(200);
    });

    it('should reject invalid input', async () => {
      const response = await request(app)
        .post('/conversations')
        .send({ title: '' });
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /conversations/:id', () => {
    it('should delete a conversation', async () => {
      conversations.deleteConversation.mockResolvedValue(undefined);

      const response = await request(app).delete('/conversations/conv-1');

      expect(response.status).toBe(204);
      expect(conversations.deleteConversation).toHaveBeenCalledWith(
        'conv-1',
        mockCredentials.user().principal.userEntityRef,
      );
    });

    it('should return 404 for non-existent conversation', async () => {
      conversations.deleteConversation.mockRejectedValue(
        new (require('@backstage/errors').NotFoundError)('Not found'),
      );

      const response = await request(app).delete('/conversations/missing');
      expect(response.status).toBe(404);
    });
  });
});
