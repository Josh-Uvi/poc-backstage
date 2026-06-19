/** @jest-environment node */
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  OpenAiEmbeddingProvider,
  GoogleEmbeddingProvider,
} from './EmbeddingProvider';

const server = setupServer(
  http.post('https://api.openai.com/v1/embeddings', async ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (auth !== 'Bearer mock-openai-token') {
      return new HttpResponse(null, { status: 401 });
    }

    const body = (await request.json()) as any;
    if (body.model !== 'text-embedding-3-small') {
      return HttpResponse.json({ error: { message: 'Model not found' } }, { status: 404 });
    }

    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    
    return HttpResponse.json({
      object: 'list',
      data: inputs.map((_, i) => ({
        object: 'embedding',
        index: i,
        embedding: [0.1, 0.2, 0.3],
      })),
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 10, total_tokens: 10 },
    });
  }),

  http.post('https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent', async ({ request }) => {
    const url = new URL(request.url);
    const key = url.searchParams.get('key') || request.headers.get('x-goog-api-key');
    if (key !== 'mock-google-token') {
      return new HttpResponse(null, { status: 401 });
    }

    return HttpResponse.json({
      embeddings: [
        {
          values: [0.4, 0.5, 0.6],
        },
      ],
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('EmbeddingProvider', () => {
  describe('OpenAiEmbeddingProvider', () => {
    it('returns embeddings for an array of texts', async () => {
      const provider = new OpenAiEmbeddingProvider({
        apiToken: 'mock-openai-token',
      });

      const embeddings = await provider.embed(['Hello', 'World']);
      
      expect(embeddings).toHaveLength(2);
      expect(embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(embeddings[1]).toEqual([0.1, 0.2, 0.3]);
    });

    it('throws on auth failure', async () => {
      const provider = new OpenAiEmbeddingProvider({
        apiToken: 'bad-token',
      });

      await expect(provider.embed(['Hello'])).rejects.toThrow(/401/);
    });
  });

  describe('GoogleEmbeddingProvider', () => {
    it('returns embeddings for an array of texts', async () => {
      const provider = new GoogleEmbeddingProvider({
        apiToken: 'mock-google-token',
      });

      const embeddings = await provider.embed(['Hello', 'World']);
      
      expect(embeddings).toHaveLength(2);
      expect(embeddings[0]).toEqual([0.4, 0.5, 0.6]);
      expect(embeddings[1]).toEqual([0.4, 0.5, 0.6]);
    });

    it('throws on auth failure', async () => {
      const provider = new GoogleEmbeddingProvider({
        apiToken: 'bad-token',
      });

      await expect(provider.embed(['Hello'])).rejects.toThrow();
    });
  });
});
