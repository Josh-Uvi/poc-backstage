export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  temperature: number;
}

export interface LlmResponse {
  content: string;
  modelId: string;
}

export interface LlmProvider {
  chat(request: LlmRequest): Promise<LlmResponse>;
  stream(request: LlmRequest): AsyncIterable<string>;
}
