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
      }) {
        const permissionsEnabled =
          config.getOptionalBoolean('ragChat.permission.enabled') ?? false;

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
          }),
        );
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
