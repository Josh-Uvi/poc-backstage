import { GoogleGenAI } from '@google/genai';
import { LlmProvider, LlmRequest, LlmResponse, LlmStreamEvent } from './LlmProvider';

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
    const usage = response.usageMetadata ? {
      promptTokens: response.usageMetadata.promptTokenCount ?? 0,
      completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
      totalTokens: response.usageMetadata.totalTokenCount ?? 0,
    } : undefined;
    return { content, modelId: this.#modelId, usage };
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const { chat, lastMessage } = this.#buildChat(request);
    const stream = await chat.sendMessageStream({ message: lastMessage });
    for await (const chunk of stream) {
      const token = chunk.text;
      if (token) yield { type: 'token', token };
      
      if (chunk.usageMetadata) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
            completionTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
          }
        };
      }
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
