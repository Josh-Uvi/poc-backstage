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
      upsertConversation: jest.fn(),
      deleteConversation: jest.fn(),
    } as any;

    llm = { chat: jest.fn().mockResolvedValue(mockLlmResponse) };
    rag = {
      indexSource: jest.fn().mockResolvedValue(undefined),
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
    it('should return an assistant response', async () => {
      conversations.upsertConversation.mockResolvedValue(mockConversation);
      conversations.listConversations.mockResolvedValue([mockConversation]);

      const response = await request(app).post('/chat').send({
        message: 'Hello',
        modelId: 'gpt-4',
        conversationId: 'conv-1',
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        conversationId: 'conv-1',
        message: expect.objectContaining({
          role: 'assistant',
          content: mockLlmResponse.content,
        }),
      });
      expect(llm.chat).toHaveBeenCalledWith('gpt-4', expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'user', content: 'Hello' }]),
      }));
      expect(rag.indexSource).not.toHaveBeenCalled();
      expect(rag.retrieve).not.toHaveBeenCalled();
    });

    it('should call RAG retrieve when sourceIds are provided', async () => {
      conversations.upsertConversation.mockResolvedValue(mockConversation);
      conversations.listConversations.mockResolvedValue([mockConversation]);
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
      // Context should be injected into the LLM messages
      expect(llm.chat).toHaveBeenCalledWith('gpt-4', expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'assistant', content: expect.stringContaining('Backstage is a platform.') }),
        ]),
      }));
    });

    it('should create a new conversation when no conversationId is provided', async () => {
      conversations.upsertConversation.mockResolvedValue(mockConversation);
      conversations.listConversations.mockResolvedValue([mockConversation]);

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
