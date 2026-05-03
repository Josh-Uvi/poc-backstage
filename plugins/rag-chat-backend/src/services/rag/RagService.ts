import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
  RootConfigService,
  BackstageCredentials,
} from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import {
  EmbeddingProvider,
  OpenAiEmbeddingProvider,
  GoogleEmbeddingProvider,
  AnthropicEmbeddingProvider,
} from './EmbeddingProvider';
import { InMemoryVectorStore, VectorStore, VectorEntry } from './VectorStore';
import { CatalogRagSource } from './CatalogRagSource';
import { TechDocsRagSource } from './TechDocsRagSource';
import { CustomRagSource, CustomSourceConfig } from './CustomRagSource';
import { chunkText, Chunk } from './Chunker';

export interface RetrievedContext {
  text: string;
  metadata: Record<string, string>;
}

export interface IRagService {
  indexSource(sourceId: string, credentials: BackstageCredentials): Promise<void>;
  indexDocument(options: {
    sourceId: string;
    documentText: string;
    metadata: Record<string, string>;
  }): Promise<void>;
  retrieve(query: string, sourceIds: string[], topK?: number): Promise<RetrievedContext[]>;
}

export class RagService implements IRagService {
  readonly #logger: LoggerService;
  readonly #embedding: EmbeddingProvider;
  readonly #store: VectorStore;
  readonly #catalogSource: CatalogRagSource;
  readonly #techDocsSource: TechDocsRagSource;
  readonly #customSource: CustomRagSource;
  readonly #customSources: Map<string, CustomSourceConfig>;

  static create(options: {
    config: RootConfigService;
    logger: LoggerService;
    catalog: CatalogClient;
  }): RagService {
    const { config, logger, catalog } = options;

    const embedding = RagService.#buildEmbeddingProvider(config, logger);
    const store = new InMemoryVectorStore();

    const techdocsBaseUrl =
      config.getOptionalString('backend.baseUrl') ?? 'http://localhost:7007';

    const catalogSource = new CatalogRagSource(catalog);
    const techDocsSource = new TechDocsRagSource({
      catalog,
      techdocsBaseUrl: `${techdocsBaseUrl}/api/techdocs`,
      logger,
    });
    const customSource = new CustomRagSource(logger);

    // Load custom sources from config
    const customSources = new Map<string, CustomSourceConfig>();
    const sourcesConfig = config.getOptionalConfigArray('ragChat.sources') ?? [];
    for (const s of sourcesConfig) {
      const type = s.getOptionalString('type');
      if (type === 'custom') {
        const id = s.getString('id');
        const target = s.getOptionalString('target');
        if (target) {
          customSources.set(id, { id, name: s.getString('name'), target });
        }
      }
    }

    return new RagService({
      logger,
      embedding,
      store,
      catalogSource,
      techDocsSource,
      customSource,
      customSources,
    });
  }

  static #buildEmbeddingProvider(
    config: RootConfigService,
    logger: LoggerService,
  ): EmbeddingProvider {
    const embeddingConfig = config.getOptionalConfig('ragChat.embedding');
    const provider = embeddingConfig?.getOptionalString('provider') ?? 'openai';
    const apiToken = embeddingConfig?.getOptionalString('apiToken') ?? '';
    const apiBaseUrl = embeddingConfig?.getOptionalString('apiBaseUrl');
    const model = embeddingConfig?.getOptionalString('model');

    if (!apiToken) {
      logger.warn(
        'ragChat.embedding.apiToken not set — RAG retrieval will return empty context. ' +
        'Configure ragChat.embedding in app-config.yaml.',
      );
      return { embed: async () => [] };
    }

    switch (provider) {
      case 'anthropic':
        return new AnthropicEmbeddingProvider({ apiToken, apiBaseUrl });
      case 'google':
        return new GoogleEmbeddingProvider({ apiToken, model });
      case 'openai':
      default:
        return new OpenAiEmbeddingProvider({ apiToken, apiBaseUrl, model });
    }
  }

  private constructor(options: {
    logger: LoggerService;
    embedding: EmbeddingProvider;
    store: VectorStore;
    catalogSource: CatalogRagSource;
    techDocsSource: TechDocsRagSource;
    customSource: CustomRagSource;
    customSources: Map<string, CustomSourceConfig>;
  }) {
    this.#logger = options.logger;
    this.#embedding = options.embedding;
    this.#store = options.store;
    this.#catalogSource = options.catalogSource;
    this.#techDocsSource = options.techDocsSource;
    this.#customSource = options.customSource;
    this.#customSources = options.customSources;
  }

  async indexSource(
    sourceId: string,
    credentials: BackstageCredentials,
  ): Promise<void> {
    this.#logger.info(`Indexing RAG source: ${sourceId}`);
    let chunks: Chunk[] = [];

    if (sourceId === 'catalog') {
      chunks = await this.#catalogSource.fetchChunks(credentials);
    } else if (sourceId === 'techdocs') {
      chunks = await this.#techDocsSource.fetchChunks();
    } else {
      const customConfig = this.#customSources.get(sourceId);
      if (!customConfig) {
        this.#logger.warn(`Unknown RAG source '${sourceId}' — skipping`);
        return;
      }
      chunks = await this.#customSource.fetchChunks(customConfig);
    }

    if (!chunks.length) {
      this.#logger.info(`No chunks produced for source '${sourceId}'`);
      return;
    }

    await this.#indexChunks(sourceId, chunks);
  }

  async indexDocument(options: {
    sourceId: string;
    documentText: string;
    metadata: Record<string, string>;
  }): Promise<void> {
    const chunks = chunkText(options.documentText, options.metadata);
    if (!chunks.length) {
      this.#logger.info(`No chunks produced for uploaded source '${options.sourceId}'`);
      return;
    }

    await this.#indexChunks(options.sourceId, chunks);
  }

  async #indexChunks(sourceId: string, chunks: Chunk[]): Promise<void> {
    if (!chunks.length) {
      return;
    }

    const texts = chunks.map(c => c.text);
    const embeddings = await this.#embedding.embed(texts);

    if (!embeddings.length) {
      this.#logger.warn(`Embedding returned empty for source '${sourceId}'`);
      return;
    }

    const entries: VectorEntry[] = chunks.map((chunk, i) => ({
      chunk,
      embedding: embeddings[i] ?? [],
      sourceId,
    }));

    await this.#store.upsert(sourceId, entries);
    this.#logger.info(
      `Indexed ${entries.length} chunks for source '${sourceId}'`,
    );
  }

  async retrieve(
    query: string,
    sourceIds: string[],
    topK = 5,
  ): Promise<RetrievedContext[]> {
    const [queryEmbedding] = await this.#embedding.embed([query]);
    if (!queryEmbedding?.length) return [];

    const results = await this.#store.query(queryEmbedding, sourceIds, topK);
    return results.map(r => ({ text: r.chunk.text, metadata: r.chunk.metadata }));
  }
}

export const ragServiceRef = createServiceRef<IRagService>({
  id: 'rag-chat.rag',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        catalog: catalogServiceRef,
      },
      async factory(deps) {
        return RagService.create({
          config: deps.config,
          logger: deps.logger,
          catalog: deps.catalog as unknown as CatalogClient,
        });
      },
    }),
});
