import { GoogleGenerativeAI } from '@google/generative-ai';
import { LlmProvider, LlmRequest, LlmResponse } from './LlmProvider';

export class GoogleProvider implements LlmProvider {
  readonly #client: GoogleGenerativeAI;
  readonly #modelId: string;

  constructor(options: { apiToken: string; modelId: string }) {
    this.#client = new GoogleGenerativeAI(options.apiToken);
    this.#modelId = options.modelId;
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const model = this.#client.getGenerativeModel({
      model: this.#modelId,
      generationConfig: { temperature: request.temperature },
    });

    // Separate system prompt (assistant messages) from the conversation
    const history = request.messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = request.messages[request.messages.length - 1];
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage?.content ?? '');
    const content = result.response.text();
    return { content, modelId: this.#modelId };
  }
}
