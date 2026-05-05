import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider, LlmRequest, LlmResponse, LlmStreamEvent } from './LlmProvider';

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
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const conversationMessages = request.messages.filter(m => m.role !== 'system');
    
    return {
      model: this.#modelId,
      max_tokens: 4096,
      temperature: request.temperature,
      system: systemMessages.length
        ? systemMessages.map(m => m.content).join('\n')
        : undefined,
      messages: conversationMessages.map(m => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
    };
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const response = await this.#client.messages.create(this.#buildParams(request));
    const content =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    const usage = response.usage ? {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    } : undefined;
    return { content, modelId: this.#modelId, usage };
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const stream = this.#client.messages.stream(this.#buildParams(request));
    let promptTokens = 0;
    
    for await (const event of stream) {
      if (event.type === 'message_start' && event.message.usage) {
        promptTokens = event.message.usage.input_tokens;
      }

      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield { type: 'token', token: event.delta.text };
      }

      if (event.type === 'message_delta' && event.usage) {
        yield {
          type: 'usage',
          usage: {
            promptTokens,
            completionTokens: event.usage.output_tokens,
            totalTokens: promptTokens + event.usage.output_tokens,
          }
        };
      }
    }
  }
}
