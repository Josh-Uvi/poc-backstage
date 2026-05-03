import crypto from 'node:crypto';
import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  DatabaseService,
  LoggerService,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { NotFoundError } from '@backstage/errors';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ConversationSourceRef {
  id: string;
  conversationId: string;
  sourceId: string;
  fileName: string;
  contentType?: string;
  createdAt: string;
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
  listConversationSources(
    conversationId: string,
    userRef: string,
  ): Promise<ConversationSourceRef[]>;
  addConversationSource(
    input: {
      id?: string;
      conversationId: string;
      sourceId: string;
      fileName: string;
      contentType?: string;
    },
    userRef: string,
  ): Promise<ConversationSourceRef>;
  upsertConversation(
    input: UpsertConversationInput,
    userRef: string,
  ): Promise<Conversation>;
  deleteConversation(id: string, userRef: string): Promise<void>;
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface ConversationRow {
  id: string;
  user_ref: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  timestamp: string;
}

interface ConversationSourceRow {
  id: string;
  conversation_id: string;
  source_id: string;
  file_name: string;
  content_type: string | null;
  created_at: string;
}

// ── Database implementation ───────────────────────────────────────────────────

export class ConversationService implements IConversationService {
  readonly #db: Awaited<ReturnType<DatabaseService['getClient']>>;
  readonly #logger: LoggerService;

  static async create(options: {
    database: DatabaseService;
    logger: LoggerService;
  }): Promise<ConversationService> {
    const client = await options.database.getClient();

    // Run migrations from the migrations directory
    const migrationsDir = resolvePackagePath(
      '@internal/backstage-plugin-rag-chat-backend',
      'src/services/migrations',
    );

    await client.migrate.latest({
      directory: migrationsDir,
      loadExtensions: ['.ts', '.js'],
    });

    return new ConversationService(client, options.logger);
  }

  private constructor(
    db: Awaited<ReturnType<DatabaseService['getClient']>>,
    logger: LoggerService,
  ) {
    this.#db = db;
    this.#logger = logger;
  }

  async listConversations(userRef: string): Promise<Conversation[]> {
    const rows = await this.#db<ConversationRow>('rag_chat_conversations')
      .where({ user_ref: userRef })
      .orderBy('updated_at', 'desc');

    return Promise.all(rows.map(row => this.#hydrateConversation(row)));
  }

  async listConversationSources(
    conversationId: string,
    userRef: string,
  ): Promise<ConversationSourceRef[]> {
    await this.#requireOwnedConversation(conversationId, userRef);

    const rows = await this.#db<ConversationSourceRow>('rag_chat_conversation_sources')
      .where({ conversation_id: conversationId })
      .orderBy('created_at', 'asc');

    return rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      sourceId: row.source_id,
      fileName: row.file_name,
      contentType: row.content_type ?? undefined,
      createdAt: row.created_at,
    }));
  }

  async addConversationSource(
    input: {
      id?: string;
      conversationId: string;
      sourceId: string;
      fileName: string;
      contentType?: string;
    },
    userRef: string,
  ): Promise<ConversationSourceRef> {
    await this.#requireOwnedConversation(input.conversationId, userRef);

    const id = input.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    await this.#db<ConversationSourceRow>('rag_chat_conversation_sources').insert({
      id,
      conversation_id: input.conversationId,
      source_id: input.sourceId,
      file_name: input.fileName,
      content_type: input.contentType ?? null,
      created_at: now,
    });

    return {
      id,
      conversationId: input.conversationId,
      sourceId: input.sourceId,
      fileName: input.fileName,
      contentType: input.contentType,
      createdAt: now,
    };
  }

  async upsertConversation(
    input: UpsertConversationInput,
    userRef: string,
  ): Promise<Conversation> {
    const now = new Date().toISOString();
    const id = input.id ?? crypto.randomUUID();

    const existing = await this.#db<ConversationRow>('rag_chat_conversations')
      .where({ id })
      .first();

    if (existing && existing.user_ref !== userRef) {
      throw new NotFoundError(`Conversation '${id}' not found`);
    }

    await this.#db<ConversationRow>('rag_chat_conversations')
      .insert({
        id,
        user_ref: userRef,
        title: input.title,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      })
      .onConflict('id')
      .merge(['title', 'updated_at']);

    // Replace messages if provided
    if (input.messages !== undefined) {
      await this.#db<MessageRow>('rag_chat_messages')
        .where({ conversation_id: id })
        .delete();

      if (input.messages.length) {
        await this.#db<MessageRow>('rag_chat_messages').insert(
          input.messages.map(m => ({
            id: m.id,
            conversation_id: id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
        );
      }
    }

    this.#logger.info('Upserted conversation', { id, userRef });

    const row = await this.#db<ConversationRow>('rag_chat_conversations')
      .where({ id })
      .first();

    return this.#hydrateConversation(row!);
  }

  async deleteConversation(id: string, userRef: string): Promise<void> {
    const existing = await this.#db<ConversationRow>('rag_chat_conversations')
      .where({ id })
      .first();

    if (!existing || existing.user_ref !== userRef) {
      throw new NotFoundError(`Conversation '${id}' not found`);
    }

    // Messages are deleted via CASCADE
    await this.#db<ConversationRow>('rag_chat_conversations')
      .where({ id })
      .delete();

    this.#logger.info('Deleted conversation', { id, userRef });
  }

  async #hydrateConversation(row: ConversationRow): Promise<Conversation> {
    const messages = await this.#db<MessageRow>('rag_chat_messages')
      .where({ conversation_id: row.id })
      .orderBy('timestamp', 'asc');

    return {
      id: row.id,
      title: row.title,
      userRef: row.user_ref,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
      })),
    };
  }

  async #requireOwnedConversation(
    conversationId: string,
    userRef: string,
  ): Promise<ConversationRow> {
    const row = await this.#db<ConversationRow>('rag_chat_conversations')
      .where({ id: conversationId })
      .first();

    if (!row || row.user_ref !== userRef) {
      throw new NotFoundError(`Conversation '${conversationId}' not found`);
    }

    return row;
  }
}

// ── Service ref ───────────────────────────────────────────────────────────────

export const conversationServiceRef = createServiceRef<IConversationService>({
  id: 'rag-chat.conversation',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        database: coreServices.database,
        logger: coreServices.logger,
      },
      async factory(deps) {
        return ConversationService.create(deps);
      },
    }),
});
