import {
  mockCredentials,
  startTestBackend,
} from '@backstage/backend-test-utils';
import { createServiceFactory } from '@backstage/backend-plugin-api';
import { ragChatPlugin } from './plugin';
import { llmServiceRef } from './services/llm/LlmService';
import { ragServiceRef } from './services/rag/RagService';
import request from 'supertest';

const mockLlmFactory = createServiceFactory({
  service: llmServiceRef,
  deps: {},
  factory: () => ({
    chat: jest.fn().mockResolvedValue({
      content: 'Mocked assistant response.',
      modelId: 'gpt-4',
    }),
    stream: jest.fn().mockImplementation(async function* mockStream() {
      yield { type: 'token', token: 'Mocked ' };
      yield { type: 'token', token: 'assistant ' };
      yield { type: 'token', token: 'response.' };
    }),
  }),
});

const mockRagFactory = createServiceFactory({
  service: ragServiceRef,
  deps: {},
  factory: () => ({
    indexSource: jest.fn().mockResolvedValue(undefined),
    indexDocument: jest.fn().mockResolvedValue(undefined),
    retrieve: jest.fn().mockResolvedValue([]),
  }),
});

const startBackend = () =>
  startTestBackend({ features: [ragChatPlugin, mockLlmFactory, mockRagFactory] });

describe('ragChatPlugin', () => {
  let server: any;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
  });

  it('should list conversations (empty initially)', async () => {
    const backend = await startBackend();
    server = backend.server;
    const res = await request(server).get('/api/rag-chat/conversations');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('should create and retrieve a conversation', async () => {
    const backend = await startBackend();
    server = backend.server;

    const createRes = await request(server)
      .post('/api/rag-chat/conversations')
      .send({ title: 'My first conversation' });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      id: expect.any(String),
      title: 'My first conversation',
      userRef: mockCredentials.user().principal.userEntityRef,
      messages: [],
    });

    const listRes = await request(server).get('/api/rag-chat/conversations');
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].title).toBe('My first conversation');
  });

  it('should send a chat message and get a streamed response', async () => {
    const backend = await startBackend();
    server = backend.server;

    const convRes = await request(server)
      .post('/api/rag-chat/conversations')
      .send({ title: 'Chat test' });
    const convId = convRes.body.id;

    const chatRes = await request(server).post('/api/rag-chat/chat').send({
      message: 'What is Backstage?',
      modelId: 'gpt-4',
      conversationId: convId,
      sourceIds: ['catalog'],
    });

    expect(chatRes.status).toBe(200);
    expect(chatRes.headers['content-type']).toMatch(/text\/event-stream/);
    expect(chatRes.text).toContain('"type":"token"');
    expect(chatRes.text).toContain('"type":"done"');
    expect(chatRes.text).toContain(`"conversationId":"${convId}"`);
  });

  it('should upload a file and return a source reference', async () => {
    const backend = await startBackend();
    server = backend.server;

    const convRes = await request(server)
      .post('/api/rag-chat/conversations')
      .send({ title: 'Upload test' });
    const convId = convRes.body.id;

    const uploadRes = await request(server)
      .post('/api/rag-chat/upload')
      .field('conversationId', convId)
      .attach('file', Buffer.from('uploaded knowledge base'), 'notes.txt');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.source).toMatchObject({
      conversationId: convId,
      fileName: 'notes.txt',
      sourceId: expect.stringContaining(`upload:${convId}:`),
    });
  });

  it('should delete a conversation', async () => {
    const backend = await startBackend();
    server = backend.server;

    const createRes = await request(server)
      .post('/api/rag-chat/conversations')
      .send({ title: 'To be deleted' });
    const convId = createRes.body.id;

    const deleteRes = await request(server).delete(
      `/api/rag-chat/conversations/${convId}`,
    );
    expect(deleteRes.status).toBe(204);

    const listRes = await request(server).get('/api/rag-chat/conversations');
    expect(listRes.body.items).toHaveLength(0);
  });

  it('should return 404 when deleting a non-existent conversation', async () => {
    const backend = await startBackend();
    server = backend.server;
    const res = await request(server).delete(
      '/api/rag-chat/conversations/does-not-exist',
    );
    expect(res.status).toBe(404);
  });

  it('should return 400 for invalid chat input', async () => {
    const backend = await startBackend();
    server = backend.server;
    const res = await request(server)
      .post('/api/rag-chat/chat')
      .send({ message: '' });
    expect(res.status).toBe(400);
  });
});
