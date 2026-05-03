import { GoogleGenerativeAI } from '@google/generative-ai';
import { LlmProvider, LlmRequest, LlmResponse } from './LlmProvider';

export class GoogleProvider implements LlmProvider {
  readonly #client: GoogleGenerativeAI;
  readonly #modelId: string;

  constructor(options: { apiToken: string; modelId: string }) {
    this.#client = new GoogleGenerativeAI(options.apiToken);
    this.#modelId = options.modelId;
  }

  #buildChat(request: LlmRequest) {
    const model = this.#client.getGenerativeModel({
      model: this.#modelId,
      generationConfig: { temperature: request.temperature },
    });
    const history = request.messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const lastMessage = request.messages[request.messages.length - 1];
    return { chat: model.startChat({ history }), lastMessage };
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const { chat, lastMessage } = this.#buildChat(request);
    const result = await chat.sendMessage(lastMessage?.content ?? '');
    return { content: result.response.text(), modelId: this.#modelId };
  }

  async *stream(request: LlmRequest): AsyncIterable<string> {
    const { chat, lastMessage } = this.#buildChat(request);
    const result = await chat.sendMessageStream(lastMessage?.content ?? '');
    for await (const chunk of result.stream) {
      const token = chunk.text();
      if (token) yield token;
    }
  }
}
