import OpenAI from 'openai';
import { LlmProvider, LlmRequest, LlmResponse } from './LlmProvider';

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
    return { content, modelId: this.#modelId };
  }

  async *stream(request: LlmRequest): AsyncIterable<string> {
    const stream = await this.#client.chat.completions.create({
      model: this.#modelId,
      temperature: request.temperature,
      messages: request.messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    });
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) yield token;
    }
  }
}
