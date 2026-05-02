import crypto from 'node:crypto';
import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { NotFoundError } from '@backstage/errors';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  userRef: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertConversationInput {
  id?: string;
  title: string;
  messages?: ConversationMessage[];
}

export interface IConversationService {
  listConversations(userRef: string): Promise<Conversation[]>;
  upsertConversation(input: UpsertConversationInput, userRef: string): Promise<Conversation>;
  deleteConversation(id: string, userRef: string): Promise<void>;
}

export class ConversationService implements IConversationService {
  readonly #logger: LoggerService;
  readonly #store = new Map<string, Conversation>();

  static create(options: { logger: LoggerService }) {
    return new ConversationService(options.logger);
  }

  private constructor(logger: LoggerService) {
    this.#logger = logger;
  }

  async listConversations(userRef: string): Promise<Conversation[]> {
    return Array.from(this.#store.values())
      .filter(c => c.userRef === userRef)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async upsertConversation(
    input: UpsertConversationInput,
    userRef: string,
  ): Promise<Conversation> {
    const now = new Date().toISOString();
    const id = input.id ?? crypto.randomUUID();
    const existing = this.#store.get(id);

    if (existing && existing.userRef !== userRef) {
      throw new NotFoundError(`Conversation '${id}' not found`);
    }

    const conversation: Conversation = {
      id,
      title: input.title,
      userRef,
      messages: input.messages ?? existing?.messages ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.#store.set(id, conversation);
    this.#logger.info('Upserted conversation', { id, userRef });
    return conversation;
  }

  async deleteConversation(id: string, userRef: string): Promise<void> {
    const existing = this.#store.get(id);
    if (!existing || existing.userRef !== userRef) {
      throw new NotFoundError(`Conversation '${id}' not found`);
    }
    this.#store.delete(id);
    this.#logger.info('Deleted conversation', { id, userRef });
  }
}

export const conversationServiceRef = createServiceRef<IConversationService>({
  id: 'rag-chat.conversation',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: { logger: coreServices.logger },
      async factory(deps) {
        return ConversationService.create(deps);
      },
    }),
});
