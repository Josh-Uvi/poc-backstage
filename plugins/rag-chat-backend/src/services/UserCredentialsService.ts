import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  DatabaseService,
  LoggerService,
} from '@backstage/backend-plugin-api';

export interface UserCredentials {
  apiToken: string;
  apiBaseUrl?: string;
}

export interface IUserCredentialsService {
  saveCredentials(
    userRef: string,
    modelId: string,
    credentials: UserCredentials,
  ): Promise<void>;
  getCredentials(
    userRef: string,
    modelId: string,
  ): Promise<UserCredentials | undefined>;
}

export class UserCredentialsService implements IUserCredentialsService {
  readonly #db: Awaited<ReturnType<DatabaseService['getClient']>>;

  static async create(options: {
    database: DatabaseService;
    logger: LoggerService;
  }): Promise<UserCredentialsService> {
    const client = await options.database.getClient();
    return new UserCredentialsService(client);
  }

  private constructor(db: Awaited<ReturnType<DatabaseService['getClient']>>) {
    this.#db = db;
  }

  async saveCredentials(
    userRef: string,
    modelId: string,
    credentials: UserCredentials,
  ): Promise<void> {
    await this.#db('rag_chat_user_credentials')
      .insert({
        user_ref: userRef,
        model_id: modelId,
        api_token: credentials.apiToken,
        api_base_url: credentials.apiBaseUrl ?? null,
        updated_at: new Date().toISOString(),
      })
      .onConflict(['user_ref', 'model_id'])
      .merge(['api_token', 'api_base_url', 'updated_at']);
  }

  async getCredentials(
    userRef: string,
    modelId: string,
  ): Promise<UserCredentials | undefined> {
    const row = await this.#db('rag_chat_user_credentials')
      .where({ user_ref: userRef, model_id: modelId })
      .first();

    if (!row) return undefined;

    return {
      apiToken: row.api_token,
      apiBaseUrl: row.api_base_url ?? undefined,
    };
  }
}

export const userCredentialsServiceRef = createServiceRef<IUserCredentialsService>({
  id: 'rag-chat.user-credentials',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        database: coreServices.database,
        logger: coreServices.logger,
      },
      async factory(deps) {
        return UserCredentialsService.create(deps);
      },
    }),
});
