import {
  createFrontendPlugin,
  PageBlueprint,
  ApiBlueprint,
  createApiFactory,
  configApiRef,
} from '@backstage/frontend-plugin-api';
import ChatIcon from '@material-ui/icons/Chat';
import { ragChatConfigApiRef, RagChatConfigClient } from './api';
import { rootRouteRef } from './routes';

export const page = PageBlueprint.make({
  params: {
    path: '/rag-chat',
    routeRef: rootRouteRef,
    title: 'RAG Chat',
    icon: <ChatIcon />,
    loader: () =>
      import('./components/ChatUI').then(m =>
        <m.ChatInterface />,
      ),
  },
});

export const ragChatConfigApi = ApiBlueprint.make({
  params: defineParams =>
    defineParams(
      createApiFactory({
        api: ragChatConfigApiRef,
        deps: { configApi: configApiRef },
        factory: ({ configApi }) =>
          new RagChatConfigClient(
            configApi.getOptional('ragChat') ?? {},
          ),
      }),
    ),
});

export const ragChatPlugin = createFrontendPlugin({
  pluginId: 'rag-chat',
  extensions: [page, ragChatConfigApi],
  routes: {
    root: rootRouteRef,
  },
});
