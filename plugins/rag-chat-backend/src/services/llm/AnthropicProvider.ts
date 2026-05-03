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

  #buildParams(request: LlmRequest) {
    const systemMessages = request.messages.filter(m => m.role === 'assistant');
    const userMessages = request.messages.filter(m => m.role === 'user');
    return {
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
    };
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const response = await this.#client.messages.create(this.#buildParams(request));
    const content =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    return { content, modelId: this.#modelId };
  }

  async *stream(request: LlmRequest): AsyncIterable<string> {
    const stream = this.#client.messages.stream(this.#buildParams(request));
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }
}
