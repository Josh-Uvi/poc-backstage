export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmRequest {
  messages: LlmMessage[];
  temperature: number;
}

export interface LlmResponse {
  content: string;
  modelId: string;
  usage?: LlmUsage;
}

export type LlmStreamEvent = 
  | { type: 'token'; token: string }
  | { type: 'usage'; usage: LlmUsage };

export interface LlmProvider {
  chat(request: LlmRequest): Promise<LlmResponse>;
  stream(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
}
