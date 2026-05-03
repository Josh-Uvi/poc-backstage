export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  streaming?: boolean;
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
  permissionEnabled: boolean;
}
