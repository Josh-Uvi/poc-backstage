import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { conversationServiceRef } from './services/ConversationService';
import { llmServiceRef } from './services/llm/LlmService';

export const ragChatPlugin = createBackendPlugin({
  pluginId: 'rag-chat',
  register(env) {
    env.registerInit({
      deps: {
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        conversations: conversationServiceRef,
        llm: llmServiceRef,
      },
      async init({ httpAuth, httpRouter, conversations, llm }) {
        httpRouter.use(
          await createRouter({ httpAuth, conversations, llm }),
        );
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
