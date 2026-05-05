import { RagChatConfigClient } from './api';

describe('RagChatConfigClient', () => {
  it('should parse an empty configuration safely', () => {
    const client = new RagChatConfigClient(undefined);
    const config = client.getConfig();
    expect(config.models).toEqual([]);
    expect(config.sources).toEqual([]);
    expect(config.embedding).toBeUndefined();
    expect(config.defaultModelId).toBeUndefined();
    expect(config.defaultEmbeddingModelId).toBeUndefined();
    expect(config.defaultSourceIds).toEqual([]);
    expect(config.permissionEnabled).toBe(false);
  });

  it('should parse minimal configuration correctly', () => {
    const rawConfig = {
      providers: {
        type: 'openai',
      },
      permission: {
        enabled: true,
      },
    };
    const client = new RagChatConfigClient(rawConfig);
    const config = client.getConfig();
    expect(config.permissionEnabled).toBe(true);
    expect(config.models).toEqual([]);
    expect(config.embedding).toBeUndefined();
  });

  it('should parse full configuration including models, embedding, and sources', () => {
    const rawConfig = {
      defaultModelId: 'gpt-4',
      defaultSourceIds: ['catalog'],
      permission: {
        enabled: false,
      },
      providers: {
        type: 'openai',
        apiBaseUrl: 'https://api.openai.com/v1',
        chatModel: [
          { id: 'gpt-4', name: 'GPT-4' },
          { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', apiBaseUrl: 'https://custom.openai/v1' },
        ],
        embedding: {
          model: 'text-embedding-3-small',
        },
      },
      sources: [
        { id: 'catalog', name: 'Catalog', type: 'catalog', description: 'desc' },
      ],
    };

    const client = new RagChatConfigClient(rawConfig);
    const config = client.getConfig();

    expect(config.defaultModelId).toBe('gpt-4');
    expect(config.defaultEmbeddingModelId).toBe('text-embedding-3-small');
    expect(config.defaultSourceIds).toEqual(['catalog']);
    expect(config.permissionEnabled).toBe(false);

    expect(config.embedding).toEqual({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiBaseUrl: 'https://api.openai.com/v1',
    });

    expect(config.models).toHaveLength(2);
    expect(config.models[0]).toEqual({
      id: 'gpt-4',
      name: 'GPT-4',
      provider: 'openai',
      apiBaseUrl: 'https://api.openai.com/v1',
      readOnly: true,
    });
    expect(config.models[1]).toEqual({
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      provider: 'openai',
      apiBaseUrl: 'https://custom.openai/v1',
      readOnly: true,
    });

    expect(config.sources).toHaveLength(1);
    expect(config.sources[0]).toEqual({
      id: 'catalog',
      name: 'Catalog',
      type: 'catalog',
      description: 'desc',
      readOnly: true,
    });
  });
});
