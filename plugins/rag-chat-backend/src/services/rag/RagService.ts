import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
  RootConfigService,
  BackstageCredentials,
  DatabaseService,
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
import { PgVectorStore } from './PgVectorStore';
import { CatalogRagSource } from './CatalogRagSource';
import { TechDocsRagSource } from './TechDocsRagSource';
import { CustomRagSource, CustomSourceConfig } from './CustomRagSource';
import { chunkText, Chunk } from './Chunker';

export interface RuntimeEmbeddingConfig {
  provider?: 'openai' | 'anthropic' | 'google' | 'custom';
  apiToken?: string;
  apiBaseUrl?: string;
  model?: string;
}

export interface RetrievedContext {
  text: string;
  metadata: Record<string, string>;
}

export interface IRagService {
  indexSource(
    sourceId: string,
    credentials: BackstageCredentials,
    runtimeConfig?: RuntimeEmbeddingConfig,
  ): Promise<void>;
  indexDocument(options: {
    sourceId: string;
    documentText: string;
    metadata: Record<string, string>;
  }, runtimeConfig?: RuntimeEmbeddingConfig): Promise<void>;
  retrieve(
    query: string,
    sourceIds: string[],
    topK?: number,
    runtimeConfig?: RuntimeEmbeddingConfig,
  ): Promise<RetrievedContext[]>;
}

export class RagService implements IRagService {
  readonly #logger: LoggerService;
  readonly #embedding: EmbeddingProvider;
  readonly #defaultEmbeddingConfig: RuntimeEmbeddingConfig;
  readonly #store: VectorStore;
  readonly #catalogSource: CatalogRagSource;
  readonly #techDocsSource: TechDocsRagSource;
  readonly #customSource: CustomRagSource;
  readonly #customSources: Map<string, CustomSourceConfig>;

  static async create(options: {
    config: RootConfigService;
    logger: LoggerService;
    catalog: CatalogClient;
    database: DatabaseService;
  }): Promise<RagService> {
    const { config, logger, catalog, database } = options;

    const defaultEmbeddingConfig = RagService.#readEmbeddingConfig(config);
    const embedding = RagService.#buildEmbeddingProvider(defaultEmbeddingConfig, logger);

    const client = await database.getClient();
    const clientType = client.client.config.client;
    
    let store: VectorStore;
    if (clientType === 'pg' || clientType === 'postgresql') {
      logger.info('Using PgVectorStore for RAG embeddings');
      store = new PgVectorStore(client as any);
    } else {
      logger.info('Using InMemoryVectorStore for RAG embeddings');
      store = new InMemoryVectorStore();
    }

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
      defaultEmbeddingConfig,
      store,
      catalogSource,
      techDocsSource,
      customSource,
      customSources,
    });
  }

  static #readEmbeddingConfig(config: RootConfigService): RuntimeEmbeddingConfig {
    const providerConfig = config.getOptionalConfig('ragChat.providers');
    const providerType = providerConfig?.getOptionalString('type');
    const providerApiToken = providerConfig?.getOptionalString('apiToken') ?? '';
    const providerApiBaseUrl = providerConfig?.getOptionalString('apiBaseUrl');
    const providerEmbeddingConfig = providerConfig?.getOptionalConfig('embedding');

    if (providerType) {
      return {
        provider: providerType as RuntimeEmbeddingConfig['provider'],
        apiToken:
          providerEmbeddingConfig?.getOptionalString('apiToken') ?? providerApiToken,
        apiBaseUrl:
          providerEmbeddingConfig?.getOptionalString('apiBaseUrl') ?? providerApiBaseUrl,
        model: providerEmbeddingConfig?.getOptionalString('model'),
      };
    }

    return { provider: 'openai', apiToken: '' };
  }

  static #buildEmbeddingProvider(
    embeddingConfig: RuntimeEmbeddingConfig,
    logger: LoggerService,
  ): EmbeddingProvider {
    const provider = embeddingConfig.provider ?? 'openai';
    const apiToken = embeddingConfig.apiToken ?? '';
    const apiBaseUrl = embeddingConfig.apiBaseUrl;
    const model = embeddingConfig.model;

    if (!apiToken) {
      logger.warn(
        'No embedding apiToken configured — RAG retrieval will return empty context. ' +
        'Configure ragChat.providers.apiToken (or ragChat.embedding.apiToken for legacy config) in app-config.yaml.',
      );
      return { embed: async () => [] };
    }

    switch (provider) {
      case 'anthropic':
        return new AnthropicEmbeddingProvider({ apiToken, apiBaseUrl });
      case 'google':
        return new GoogleEmbeddingProvider({ apiToken, model });
      case 'custom':
        return new OpenAiEmbeddingProvider({ apiToken, apiBaseUrl, model });
      case 'openai':
      default:
        return new OpenAiEmbeddingProvider({ apiToken, apiBaseUrl, model });
    }
  }

  private constructor(options: {
    logger: LoggerService;
    embedding: EmbeddingProvider;
    defaultEmbeddingConfig: RuntimeEmbeddingConfig;
    store: VectorStore;
    catalogSource: CatalogRagSource;
    techDocsSource: TechDocsRagSource;
    customSource: CustomRagSource;
    customSources: Map<string, CustomSourceConfig>;
  }) {
    this.#logger = options.logger;
    this.#embedding = options.embedding;
    this.#defaultEmbeddingConfig = options.defaultEmbeddingConfig;
    this.#store = options.store;
    this.#catalogSource = options.catalogSource;
    this.#techDocsSource = options.techDocsSource;
    this.#customSource = options.customSource;
    this.#customSources = options.customSources;
  }

  #resolveEmbeddingConfig(
    runtimeConfig?: RuntimeEmbeddingConfig,
  ): RuntimeEmbeddingConfig {
    return {
      provider: runtimeConfig?.provider ?? this.#defaultEmbeddingConfig.provider,
      apiToken: runtimeConfig?.apiToken ?? this.#defaultEmbeddingConfig.apiToken,
      apiBaseUrl: runtimeConfig?.apiBaseUrl ?? this.#defaultEmbeddingConfig.apiBaseUrl,
      model: runtimeConfig?.model ?? this.#defaultEmbeddingConfig.model,
    };
  }

  #resolveEmbeddingProvider(runtimeConfig?: RuntimeEmbeddingConfig): EmbeddingProvider {
    if (!runtimeConfig) {
      return this.#embedding;
    }

    return RagService.#buildEmbeddingProvider(
      this.#resolveEmbeddingConfig(runtimeConfig),
      this.#logger,
    );
  }

  #sourceKey(sourceId: string, runtimeConfig?: RuntimeEmbeddingConfig): string {
    const resolved = this.#resolveEmbeddingConfig(runtimeConfig);
    const provider = resolved.provider ?? 'openai';
    const model = resolved.model ?? 'default';
    return `${sourceId}::${provider}::${model}`;
  }

  async indexSource(
    sourceId: string,
    credentials: BackstageCredentials,
    runtimeConfig?: RuntimeEmbeddingConfig,
  ): Promise<void> {
    this.#logger.info(`Indexing RAG source: ${sourceId}`);
    let chunks: Chunk[] = [];

    if (sourceId === 'catalog') {
      chunks = await this.#catalogSource.fetchChunks(credentials);
    } else if (sourceId === 'techdocs') {
      chunks = await this.#techDocsSource.fetchChunks(credentials);
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

    await this.#indexChunks(sourceId, chunks, runtimeConfig);
  }

  async indexDocument(options: {
    sourceId: string;
    documentText: string;
    metadata: Record<string, string>;
  }, runtimeConfig?: RuntimeEmbeddingConfig): Promise<void> {
    const chunks = chunkText(options.documentText, options.metadata);
    if (!chunks.length) {
      this.#logger.info(`No chunks produced for uploaded source '${options.sourceId}'`);
      return;
    }

    await this.#indexChunks(options.sourceId, chunks, runtimeConfig);
  }

  async #indexChunks(
    sourceId: string,
    chunks: Chunk[],
    runtimeConfig?: RuntimeEmbeddingConfig,
  ): Promise<void> {
    if (!chunks.length) {
      return;
    }

    const embeddingProvider = this.#resolveEmbeddingProvider(runtimeConfig);
    const texts = chunks.map(c => c.text);
    const embeddings = await embeddingProvider.embed(texts);

    if (!embeddings.length) {
      this.#logger.warn(`Embedding returned empty for source '${sourceId}'`);
      return;
    }

    const entries: VectorEntry[] = chunks.map((chunk, i) => ({
      chunk,
      embedding: embeddings[i] ?? [],
      sourceId,
    }));

    await this.#store.upsert(this.#sourceKey(sourceId, runtimeConfig), entries);
    this.#logger.info(
      `Indexed ${entries.length} chunks for source '${sourceId}'`,
    );
  }

  async retrieve(
    query: string,
    sourceIds: string[],
    topK = 5,
    runtimeConfig?: RuntimeEmbeddingConfig,
  ): Promise<RetrievedContext[]> {
    const embeddingProvider = this.#resolveEmbeddingProvider(runtimeConfig);
    const [queryEmbedding] = await embeddingProvider.embed([query]);
    if (!queryEmbedding?.length) return [];

    const results = await this.#store.query(
      queryEmbedding,
      sourceIds.map(sourceId => this.#sourceKey(sourceId, runtimeConfig)),
      topK,
    );
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
        database: coreServices.database,
      },
      async factory(deps) {
        return await RagService.create({
          config: deps.config,
          logger: deps.logger,
          catalog: deps.catalog as unknown as CatalogClient,
          database: deps.database,
        });
      },
    }),
});
