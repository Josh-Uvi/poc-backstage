/** @jest-environment node */
import { RagService } from './RagService';
import { InMemoryVectorStore } from './VectorStore';
import { EmbeddingProvider } from './EmbeddingProvider';

class MockEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    // Generate deterministic mock embeddings
    return texts.map(text => {
      if (text.includes('kubernetes')) {
        return [0.9, 0.1, 0.0];
      }
      if (text.includes('database')) {
        return [0.1, 0.9, 0.0];
      }
      return [0.1, 0.1, 0.1];
    });
  }
}

describe('RAG Pipeline Integration', () => {
  it('indexes documents, embeds them, and retrieves relevant chunks based on semantic similarity', async () => {
    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    const mockEmbeddingProvider = new MockEmbeddingProvider();
    const vectorStore = new InMemoryVectorStore();

    // Create a mocked RagService instance directly
    const ragService = new RagService({
      logger: mockLogger,
      embedding: mockEmbeddingProvider,
      defaultEmbeddingConfig: { provider: 'openai', model: 'test', apiToken: 'dummy' },
      store: vectorStore,
      catalogSource: {} as any,
      techDocsSource: {} as any,
      customSource: {} as any,
      customSources: new Map(),
    });

    // 1. Indexing Documents
    await ragService.indexDocument({
      sourceId: 'test-source',
      documentText: `We use kubernetes for orchestrating our containers. It helps scale our microservices.
      
We also use PostgreSQL as our primary relational database to store user records.`,
      metadata: { author: 'admin' },
    });

    // 2. Retrieval - Query for kubernetes
    // The query embedding for "How do we run containers?" should theoretically be close to the kubernetes chunk.
    // In our mock, if the text has 'kubernetes' it gets [0.9, 0.1, 0.0]. We'll mock the query embed too.
    const retrieveWithMockedEmbed = async (queryText: string) => {
      const queryEmbedding = await mockEmbeddingProvider.embed([queryText]);
      return vectorStore.query(queryEmbedding[0], ['test-source::openai::test'], 2);
    };

    const k8sResults = await retrieveWithMockedEmbed('kubernetes orchestration');
    expect(k8sResults.length).toBeGreaterThan(0);
    expect(k8sResults[0].chunk.text).toContain('kubernetes');

    const dbResults = await retrieveWithMockedEmbed('database storage');
    expect(dbResults.length).toBeGreaterThan(0);
    expect(dbResults[0].chunk.text).toContain('PostgreSQL');

    // Test RagService.retrieve directly
    const results = await ragService.retrieve('kubernetes', ['test-source'], 2);
    expect(results).toHaveLength(1);
    expect(results[0].text).toContain('kubernetes');
  });
});
