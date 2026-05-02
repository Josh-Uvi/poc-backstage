import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import ChatIcon from '@material-ui/icons/Chat';

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

export const ragChatPlugin = createFrontendPlugin({
  pluginId: 'rag-chat',
  extensions: [page],
  routes: {
    root: rootRouteRef,
  }
});
