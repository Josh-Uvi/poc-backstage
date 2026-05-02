export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatUIState {
  conversations: Conversation[];
  currentConversationId: string | null;
  showSettings: boolean;
}

export interface RagChatModel {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'custom';
  apiBaseUrl?: string;
  apiToken?: string;
  userDefined?: boolean;
}

export interface RagChatSource {
  id: string;
  name: string;
  type: 'catalog' | 'techdocs' | 'custom';
  description?: string;
  userDefined?: boolean;
}

export interface RagChatConfig {
  models: RagChatModel[];
  sources: RagChatSource[];
  defaultModelId?: string;
  defaultSourceIds?: string[];
}
