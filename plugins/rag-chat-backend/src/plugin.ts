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
        auth: coreServices.auth,
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
        auth,
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
            try {
              const credentials = await auth.getOwnServiceCredentials();
              await rag.indexSource('catalog', credentials);
              await rag.indexSource('techdocs', credentials);
            } catch (error) {
              console.error('Scheduled RAG indexing failed', error);
            }
          },
        });
      },
    });
  },
});
