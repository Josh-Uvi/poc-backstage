import { createPermission } from '@backstage/plugin-permission-common';

export const ragChatChatPermission = createPermission({
  name: 'rag-chat.chat',
  attributes: { action: 'use' },
});

export const ragChatAdminPermission = createPermission({
  name: 'rag-chat.admin',
  attributes: { action: 'use' },
});

export const ragChatPermissions = [ragChatChatPermission, ragChatAdminPermission];
