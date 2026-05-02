import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { ConversationService } from './services/ConversationService';

describe('createRouter', () => {
  let app: express.Express;
  let conversations: jest.Mocked<ConversationService>;

  const mockConversation = {
    id: 'conv-1',
    title: 'Test conversation',
    userRef: mockCredentials.user().principal.userEntityRef,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    conversations = {
      listConversations: jest.fn(),
      upsertConversation: jest.fn(),
      deleteConversation: jest.fn(),
    } as any;

    const router = await createRouter({
      httpAuth: mockServices.httpAuth(),
      conversations,
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
        message: expect.objectContaining({ role: 'assistant' }),
      });
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
