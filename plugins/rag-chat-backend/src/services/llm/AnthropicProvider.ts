import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider, LlmRequest, LlmResponse } from './LlmProvider';

export class AnthropicProvider implements LlmProvider {
  readonly #client: Anthropic;
  readonly #modelId: string;

  constructor(options: { apiToken: string; apiBaseUrl?: string; modelId: string }) {
    this.#client = new Anthropic({
      apiKey: options.apiToken,
      baseURL: options.apiBaseUrl,
    });
    this.#modelId = options.modelId;
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const userMessages = request.messages.filter(m => m.role === 'user');
    const systemMessages = request.messages.filter(m => m.role === 'assistant');

    const response = await this.#client.messages.create({
      model: this.#modelId,
      max_tokens: 4096,
      temperature: request.temperature,
      system: systemMessages.length
        ? systemMessages.map(m => m.content).join('\n')
        : undefined,
      messages: userMessages.map(m => ({
        role: 'user' as const,
        content: m.content,
      })),
    });

    const content =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    return { content, modelId: this.#modelId };
  }
}
