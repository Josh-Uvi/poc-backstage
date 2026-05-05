import OpenAI from 'openai';
import { LlmProvider, LlmRequest, LlmResponse, LlmStreamEvent } from './LlmProvider';

export class OpenAiProvider implements LlmProvider {
  readonly #client: OpenAI;
  readonly #modelId: string;

  constructor(options: { apiToken: string; apiBaseUrl?: string; modelId: string }) {
    this.#client = new OpenAI({
      apiKey: options.apiToken,
      baseURL: options.apiBaseUrl,
    });
    this.#modelId = options.modelId;
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const completion = await this.#client.chat.completions.create({
      model: this.#modelId,
      temperature: request.temperature,
      messages: request.messages.map(m => ({ role: m.role, content: m.content })),
    });
    const content = completion.choices[0]?.message?.content ?? '';
    const usage = completion.usage ? {
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      totalTokens: completion.usage.total_tokens,
    } : undefined;
    return { content, modelId: this.#modelId, usage };
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const stream = await this.#client.chat.completions.create({
      model: this.#modelId,
      temperature: request.temperature,
      messages: request.messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      stream_options: { include_usage: true },
    });
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) yield { type: 'token', token };
      
      if (chunk.usage) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          }
        };
      }
    }
  }
}
