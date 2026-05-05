import { createApiRef } from '@backstage/core-plugin-api';
import {
  RagChatConfig,
  RagChatEmbeddingConfig,
  RagChatModel,
  RagChatSource,
} from './components/ChatUI/types';

export const ragChatConfigApiRef = createApiRef<RagChatConfigApi>({
  id: 'plugin.rag-chat.config',
});

export interface RagChatConfigApi {
  getConfig(): RagChatConfig;
}

export class RagChatConfigClient implements RagChatConfigApi {
  private readonly config: RagChatConfig;

  constructor(rawConfig: any) {
    this.config = RagChatConfigClient.parse(rawConfig);
  }

  getConfig(): RagChatConfig {
    return this.config;
  }

  private static parse(raw: any): RagChatConfig {
    const providerConfig = raw?.providers;
    const providerType = providerConfig?.type;
    const providerApiBaseUrl = providerConfig?.apiBaseUrl;

    const models: RagChatModel[] = providerConfig?.chatModel?.length
      ? providerConfig.chatModel.map((m: any) => ({
        id: m.id,
        name: m.name,
        provider: providerType,
        apiBaseUrl: m.apiBaseUrl ?? providerApiBaseUrl,
        readOnly: true,
      }))
      : [];

    let embedding: RagChatEmbeddingConfig | undefined;
    if (providerConfig?.embedding) {
      embedding = {
        provider: providerType,
        model: providerConfig.embedding.model,
        apiBaseUrl: providerConfig.embedding.apiBaseUrl ?? providerApiBaseUrl,
      };
    }

    const sources: RagChatSource[] = (raw?.sources ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      description: s.description,
      readOnly: true,
    }));

    return {
      models,
      sources,
      embedding,
      defaultModelId: raw?.defaultModelId,
      defaultEmbeddingModelId: embedding?.model,
      defaultSourceIds: raw?.defaultSourceIds ?? [],
      permissionEnabled: raw?.permission?.enabled ?? false,
    };
  }
}
