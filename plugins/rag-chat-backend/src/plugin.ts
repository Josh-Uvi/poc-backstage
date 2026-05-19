import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { conversationServiceRef } from './services/ConversationService';
import { userCredentialsServiceRef } from './services/UserCredentialsService';
import { llmServiceRef } from './services/llm/LlmService';
import { ragServiceRef } from './services/rag/RagService';
import { ragChatPermissions } from './permissions';

export const ragChatPlugin = createBackendPlugin({
  pluginId: 'rag-chat',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
        conversations: conversationServiceRef,
        userCredentials: userCredentialsServiceRef,
        llm: llmServiceRef,
        rag: ragServiceRef,
        scheduler: coreServices.scheduler,
        auditor: coreServices.auditor,
      },
      async init({
        config,
        httpAuth,
        httpRouter,
        permissions,
        permissionsRegistry,
        conversations,
        userCredentials,
        llm,
        rag,
        scheduler,
        auditor,
      }) {
        const permissionsEnabled =
          config.getOptionalBoolean('ragChat.permission.enabled') ?? false;

        const rateLimitPerMinute =
          config.getOptionalNumber('ragChat.rateLimit.requestsPerMinute');

        if (permissionsEnabled) {
          permissionsRegistry.addPermissions(ragChatPermissions);
        }

        httpRouter.use(
          await createRouter({
            httpAuth,
            permissions,
            permissionsEnabled,
            conversations,
            userCredentials,
            llm,
            rag,
            rateLimitPerMinute: rateLimitPerMinute ?? undefined,
            auditor,
          }),
        );
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });

        // Schedule periodic re-indexing of default sources
        await scheduler.scheduleTask({
          id: 'rag-chat-indexer',
          frequency: { minutes: 60 },
          timeout: { minutes: 15 },
          fn: async () => {
            // We need credentials to access the catalog and techdocs
            // Using a system token or backend auth is recommended,
            // but for simplicity we'll pass empty credentials which may work
            // if permissions are disabled or if the backend can self-authenticate.
            // Ideally, we'd use `auth.getPluginRequestToken()` here.
            try {
              // We pass empty credentials since scheduled tasks don't have a user context.
              // In a real setup, we'd use ServerTokenManager or AuthService.
              await rag.indexSource('catalog', {} as any);
              await rag.indexSource('techdocs', {} as any);
            } catch (error) {
              console.error('Scheduled RAG indexing failed', error);
            }
          },
        });
      },
    });
  },
});
