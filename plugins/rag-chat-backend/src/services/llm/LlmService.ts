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

const PROVIDER_TYPES = ['openai', 'anthropic', 'google', 'custom'] as const;

const isProviderType = (
  value: string | undefined,
): value is ModelConfig['provider'] =>
  Boolean(value && (PROVIDER_TYPES as readonly string[]).includes(value));

const readModelConfigs = (config: RootConfigService): ModelConfig[] => {
  const providerConfig = config.getOptionalConfig('ragChat.providers');
  const providerType = providerConfig?.getOptionalString('type');
  const providerApiToken = providerConfig?.getOptionalString('apiToken') ?? '';
  const providerApiBaseUrl = providerConfig?.getOptionalString('apiBaseUrl');
  const providerModels = providerConfig?.getOptionalConfigArray('chatModel') ?? [];

  if (isProviderType(providerType) && providerModels.length) {
    return providerModels.map(model => ({
      id: model.getString('id'),
      provider: providerType,
      apiToken: model.getOptionalString('apiToken') ?? providerApiToken,
      apiBaseUrl: model.getOptionalString('apiBaseUrl') ?? providerApiBaseUrl,
    }));
  }

  return [];
};

export interface RuntimeModelConfig {
  provider?: ModelConfig['provider'];
  apiToken?: string;
  apiBaseUrl?: string;
}

export interface ILlmService {
  chat(
    modelId: string,
    request: LlmRequest,
    runtimeConfig?: RuntimeModelConfig,
  ): Promise<LlmResponse>;

  stream(
    modelId: string,
    request: LlmRequest,
    runtimeConfig?: RuntimeModelConfig,
  ): AsyncIterable<string>;
}

export class LlmService implements ILlmService {
  readonly #providers = new Map<string, LlmProvider>();
  readonly #logger: LoggerService;

  static create(options: { config: RootConfigService; logger: LoggerService }) {
    return new LlmService(options.config, options.logger);
  }

  private constructor(config: RootConfigService, logger: LoggerService) {
    this.#logger = logger;

    const models = readModelConfigs(config);
    for (const modelConfig of models) {
      const { id, provider, apiToken } = modelConfig;

      if (!apiToken) {
        logger.warn(`ragChat model '${id}' has no apiToken — skipping`);
        continue;
      }

      try {
        this.#providers.set(id, this.#buildProvider(modelConfig));
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
      case 'custom':
        return new OpenAiProvider({
          apiToken: model.apiToken,
          apiBaseUrl: model.apiBaseUrl,
          modelId: model.id,
        });
      default:
        throw new Error(`Unsupported provider '${model.provider}' for model '${model.id}'`);
    }
  }

  #resolveProvider(modelId: string, runtimeConfig?: RuntimeModelConfig): LlmProvider {
    const provider = this.#providers.get(modelId);
    if (provider) {
      return provider;
    }

    if (runtimeConfig?.provider && runtimeConfig.apiToken) {
      return this.#buildProvider({
        id: modelId,
        provider: runtimeConfig.provider,
        apiToken: runtimeConfig.apiToken,
        apiBaseUrl: runtimeConfig.apiBaseUrl,
      });
    }

    throw new InputError(
      `No LLM provider configured for modelId '${modelId}'. ` +
      `Check ragChat.providers.chatModel in app-config.yaml.`,
    );
  }

  async chat(
    modelId: string,
    request: LlmRequest,
    runtimeConfig?: RuntimeModelConfig,
  ): Promise<LlmResponse> {
    const provider = this.#resolveProvider(modelId, runtimeConfig);
    this.#logger.info(`LLM chat request`, { modelId, messageCount: request.messages.length });
    return provider.chat(request);
  }

  async *stream(
    modelId: string,
    request: LlmRequest,
    runtimeConfig?: RuntimeModelConfig,
  ): AsyncIterable<string> {
    const provider = this.#resolveProvider(modelId, runtimeConfig);
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
