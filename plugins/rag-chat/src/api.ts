import { createApiRef } from '@backstage/core-plugin-api';
import { RagChatConfig, RagChatModel, RagChatSource } from './components/ChatUI/types';

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
    const models: RagChatModel[] = (raw?.models ?? []).map((m: any) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      apiBaseUrl: m.apiBaseUrl,
      apiToken: m.apiToken,
    }));

    const sources: RagChatSource[] = (raw?.sources ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      description: s.description,
    }));

    return {
      models,
      sources,
      defaultModelId: raw?.defaultModelId,
      defaultSourceIds: raw?.defaultSourceIds ?? [],
      permissionEnabled: raw?.permission?.enabled ?? false,
    };
  }
}
