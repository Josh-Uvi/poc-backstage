import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { LlmProvider, LlmRequest, LlmResponse } from './LlmProvider';
import { OpenAiProvider } from './OpenAiProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { GoogleProvider } from './GoogleProvider';

interface ModelConfig {
  id: string;
  provider: 'openai' | 'anthropic' | 'google' | 'custom';
  apiToken: string;
  apiBaseUrl?: string;
}

export interface ILlmService {
  chat(modelId: string, request: LlmRequest): Promise<LlmResponse>;
  stream(modelId: string, request: LlmRequest): AsyncIterable<string>;
}

export class LlmService implements ILlmService {
  readonly #providers = new Map<string, LlmProvider>();
  readonly #logger: LoggerService;

  static create(options: { config: RootConfigService; logger: LoggerService }) {
    return new LlmService(options.config, options.logger);
  }

  private constructor(config: RootConfigService, logger: LoggerService) {
    this.#logger = logger;

    const models = config.getOptionalConfigArray('ragChat.models') ?? [];
    for (const m of models) {
      const id = m.getString('id');
      const provider = m.getString('provider') as ModelConfig['provider'];
      const apiToken = m.getOptionalString('apiToken') ?? '';
      const apiBaseUrl = m.getOptionalString('apiBaseUrl');

      if (!apiToken) {
        logger.warn(`ragChat model '${id}' has no apiToken — skipping`);
        continue;
      }

      try {
        this.#providers.set(id, this.#buildProvider({ id, provider, apiToken, apiBaseUrl }));
        logger.info(`Registered LLM provider for model '${id}' (${provider})`);
      } catch (e) {
        logger.warn(`Failed to register LLM provider for model '${id}': ${e}`);
      }
    }
  }

  #buildProvider(model: ModelConfig): LlmProvider {
    switch (model.provider) {
      case 'openai':
        return new OpenAiProvider({
          apiToken: model.apiToken,
          apiBaseUrl: model.apiBaseUrl,
          modelId: model.id,
        });
      case 'anthropic':
        return new AnthropicProvider({
          apiToken: model.apiToken,
          apiBaseUrl: model.apiBaseUrl,
          modelId: model.id,
        });
      case 'google':
        return new GoogleProvider({
          apiToken: model.apiToken,
          modelId: model.id,
        });
      default:
        throw new Error(`Unsupported provider '${model.provider}' for model '${model.id}'`);
    }
  }

  async chat(modelId: string, request: LlmRequest): Promise<LlmResponse> {
    const provider = this.#providers.get(modelId);
    if (!provider) {
      throw new InputError(
        `No LLM provider configured for modelId '${modelId}'. ` +
        `Check ragChat.models in app-config.yaml.`,
      );
    }
    this.#logger.info(`LLM chat request`, { modelId, messageCount: request.messages.length });
    return provider.chat(request);
  }

  async *stream(modelId: string, request: LlmRequest): AsyncIterable<string> {
    const provider = this.#providers.get(modelId);
    if (!provider) {
      throw new InputError(
        `No LLM provider configured for modelId '${modelId}'. ` +
        `Check ragChat.models in app-config.yaml.`,
      );
    }
    this.#logger.info(`LLM stream request`, { modelId, messageCount: request.messages.length });
    yield* provider.stream(request);
  }
}

export const llmServiceRef = createServiceRef<ILlmService>({
  id: 'rag-chat.llm',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async factory(deps) {
        return LlmService.create(deps);
      },
    }),
});
