export interface Citation {
  text: string;
  metadata: Record<string, string>;
}

export type MessageFeedback = 'positive' | 'negative';

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  streaming?: boolean;
  citations?: Citation[];
  feedback?: MessageFeedback;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface UploadedSourceRef {
  id: string;
  conversationId: string;
  sourceId: string;
  fileName: string;
  contentType?: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  sourceRefs?: UploadedSourceRef[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatUIState {
  conversations: Conversation[];
  currentConversationId: string | null;
  showSettings: boolean;
}

export type RagChatProvider = 'openai' | 'anthropic' | 'google' | 'custom';

export interface RagChatModel {
  id: string;
  name: string;
  provider: RagChatProvider;
  apiBaseUrl?: string;
  apiToken?: string;
  tokenConfigured?: boolean;
  readOnly?: boolean;
  userDefined?: boolean;
}

export interface RagChatEmbeddingConfig {
  provider: RagChatProvider;
  model?: string;
  apiBaseUrl?: string;
  apiToken?: string;
  tokenConfigured?: boolean;
}

export interface RagChatSource {
  id: string;
  name: string;
  type: 'catalog' | 'techdocs' | 'custom';
  description?: string;
  readOnly?: boolean;
  userDefined?: boolean;
}

export interface RagChatConfig {
  models: RagChatModel[];
  sources: RagChatSource[];
  embedding?: RagChatEmbeddingConfig;
  defaultModelId?: string;
  defaultEmbeddingModelId?: string;
  defaultSourceIds?: string[];
  permissionEnabled: boolean;
}
