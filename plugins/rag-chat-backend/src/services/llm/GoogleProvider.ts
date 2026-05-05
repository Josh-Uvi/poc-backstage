import { GoogleGenAI } from '@google/genai';
import { LlmProvider, LlmRequest, LlmResponse } from './LlmProvider';

export class GoogleProvider implements LlmProvider {
  readonly #client: GoogleGenAI;
  readonly #modelId: string;

  constructor(options: { apiToken: string; modelId: string }) {
    this.#client = new GoogleGenAI({ apiKey: options.apiToken });
    this.#modelId = options.modelId;
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const { chat, lastMessage } = this.#buildChat(request);
    const response = await chat.sendMessage({ message: lastMessage });
    const content = response.text ?? '';
    return { content, modelId: this.#modelId };
  }

  async *stream(request: LlmRequest): AsyncIterable<string> {
    const { chat, lastMessage } = this.#buildChat(request);
    const stream = await chat.sendMessageStream({ message: lastMessage });
    for await (const chunk of stream) {
      const token = chunk.text;
      if (token) yield token;
    }
  }

  #buildChat(request: LlmRequest) {
    // Separate system context (assistant role) from the conversation history
    const systemMessages = request.messages.filter(m => m.role === 'assistant');
    const conversationMessages = request.messages.filter(m => m.role === 'user');

    // Build history: all user/model turns except the last user message
    const history = conversationMessages.slice(0, -1).map(m => ({
      role: 'user' as const,
      parts: [{ text: m.content }],
    }));

    const systemInstruction = systemMessages.length
      ? systemMessages.map(m => m.content).join('\n')
      : undefined;

    const chat = this.#client.chats.create({
      model: this.#modelId,
      history,
      config: {
        temperature: request.temperature,
        ...(systemInstruction ? { systemInstruction } : {}),
      },
    });

    const lastMessage =
      conversationMessages[conversationMessages.length - 1]?.content ?? '';

    return { chat, lastMessage };
  }
}
