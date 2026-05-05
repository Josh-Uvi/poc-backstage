import { createPermission } from '@backstage/plugin-permission-common';

export const ragChatChatPermission = createPermission({
  name: 'rag-chat.chat',
  attributes: {},
});

export const ragChatAdminPermission = createPermission({
  name: 'rag-chat.admin',
  attributes: {},
});
