import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { conversationServiceRef } from './services/ConversationService';
import { llmServiceRef } from './services/llm/LlmService';
import { ragServiceRef } from './services/rag/RagService';

export const ragChatPlugin = createBackendPlugin({
  pluginId: 'rag-chat',
  register(env) {
    env.registerInit({
      deps: {
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        conversations: conversationServiceRef,
        llm: llmServiceRef,
        rag: ragServiceRef,
      },
      async init({ httpAuth, httpRouter, conversations, llm, rag }) {
        httpRouter.use(
          await createRouter({ httpAuth, conversations, llm, rag }),
        );
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
