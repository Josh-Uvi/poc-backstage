# RAG Chat Plugin

A Backstage frontend plugin providing an AI-powered chat interface with conversation management.

## Getting Started

The plugin is available at [/rag-chat](http://localhost:3000/rag-chat) when running the app via `yarn start` from the root directory.

To serve the plugin in isolation for faster iteration:

```sh
yarn start
```

from within the `plugins/rag-chat` directory.

## Features

### Conversation Management
- Create multiple named conversations
- Switch between conversations via the sidebar
- Delete individual conversations
- Conversations are persisted in `localStorage` across page refreshes

### Chat Interface
- Modern rounded chat bubbles with theme-aware colours (supports Backstage light and dark modes)
- User messages aligned right, assistant messages aligned left
- Auto-scroll to the latest message (configurable in Settings)
- Empty state guidance when no conversation is active

### User Avatar
- The user message avatar displays the logged-in user's profile picture if available
- Falls back to initials derived from the user's display name (e.g. "John Doe" → "JD")
- Uses Backstage's `identityApiRef` to fetch the active session profile

### File Attachments
- Click the attach icon to open a file picker
- Selected file is shown as a dismissible chip above the input field
- Send button activates when either text is typed or a file is attached

### Settings Panel
- Toggle auto-scroll to latest message
- Toggle sound notifications
- Select AI model (GPT-3.5, GPT-4, GPT-4 Turbo, Claude)
- Adjust model temperature (0 = deterministic, 1 = creative)
- Settings are persisted in `localStorage`

## Architecture

Built on Backstage's [new frontend system](https://backstage.io/docs/frontend-system/architecture/index) using `PageBlueprint` and `createFrontendPlugin`.

### Key files

| File | Purpose |
|------|---------|
| `src/plugin.tsx` | Plugin and page extension registration |
| `src/routes.ts` | Route reference definitions |
| `src/components/ChatUI/ChatInterface.tsx` | Main layout, state management, identity fetch |
| `src/components/ChatUI/ChatMessage.tsx` | Individual message bubble with avatar |
| `src/components/ChatUI/ChatInput.tsx` | Text input with file attachment support |
| `src/components/ChatUI/ChatSidebar.tsx` | Conversation list and management |
| `src/components/ChatUI/SettingsPanel.tsx` | Settings dialog |
| `src/components/ChatUI/types.ts` | Shared TypeScript types |

## Running Tests

```sh
yarn test
```

All tests are located in `src/components/ChatUI/ChatInterface.test.tsx` and `src/plugin.test.ts`.
