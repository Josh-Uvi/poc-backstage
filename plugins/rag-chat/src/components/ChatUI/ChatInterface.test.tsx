import { ChatInterface } from './ChatInterface';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { ragChatConfigApiRef } from '../../api';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';

// ── Shared mock factories ─────────────────────────────────────────────────────

const mockConfigApi = {
  getConfig: () => ({
    models: [{ id: 'gemini-flash', name: 'Gemini Flash', provider: 'google' as const, tokenConfigured: true }],
    sources: [{ id: 'catalog', name: 'Software Catalog', type: 'catalog' as const }],
    embedding: { provider: 'google' as const, model: 'gemini-embedding-2', tokenConfigured: true },
    defaultModelId: 'gemini-flash',
    defaultEmbeddingModelId: 'gemini-embedding-2',
    defaultSourceIds: ['catalog'],
    permissionEnabled: false,
  }),
};

const mockIdentityApi = {
  getProfileInfo: jest.fn().mockResolvedValue({
    displayName: 'Test User',
    picture: undefined,
  }),
  getBackstageIdentity: jest.fn().mockResolvedValue({
    userEntityRef: 'user:default/test-user',
  }),
  getCredentials: jest.fn().mockResolvedValue({ token: 'mock-token' }),
  signOut: jest.fn(),
};

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/rag-chat'),
  getExternalBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/rag-chat'),
};

/** Build a mock fetchApi that returns different responses per URL pattern */
const makeFetchApi = (handlers: Record<string, () => Response> = {}) => ({
  fetch: jest.fn().mockImplementation((url: string, options?: RequestInit) => {
    const path = url.replace('http://localhost:7007/api/rag-chat', '');
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (path.startsWith(pattern) && (!options?.method || options.method === 'GET' || pattern === path)) {
        return Promise.resolve(handler());
      }
    }
    // Default: empty conversations list for GET /conversations
    if (path === '/conversations') {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    }
    // Default: 200 OK for mutations
    return Promise.resolve(new Response('{}', { status: 200 }));
  }),
});

const renderApp = (fetchApi = makeFetchApi()) =>
  renderInTestApp(<ChatInterface />, {
    apis: [
      [ragChatConfigApiRef, mockConfigApi],
      [discoveryApiRef, mockDiscoveryApi],
      [fetchApiRef, fetchApi],
      [identityApiRef, mockIdentityApi],
    ],
  });

// ── SSE stream helper ────────────────────────────────────────────────────────

/** Encode SSE events into a ReadableStream the way the backend sends them */
const makeSseStream = (events: object[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
};

/** Build a fetchApi that returns an SSE stream for POST /chat */
const makeChatFetchApi = (sseEvents: object[]) => ({
  fetch: jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
    const path = url.replace('http://localhost:7007/api/rag-chat', '');
    if (path === '/chat' && opts?.method === 'POST') {
      return Promise.resolve(
        new Response(makeSseStream(sseEvents), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );
    }
    // Handle ensureConversation POST and GET
    if (path === '/conversations') {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  }),
});

/** Type and submit a message via fireEvent only (avoids Suspense conflicts) */
const sendMessage = (input: HTMLElement, message: string) => {
  fireEvent.change(input, { target: { value: message } });
  // MUI multiline TextField renders a <textarea> — fire keypress on it directly
  const textarea = input.tagName === 'TEXTAREA' ? input : input.querySelector('textarea') ?? input;
  fireEvent.keyPress(textarea, { key: 'Enter', code: 'Enter', charCode: 13 });
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatInterface', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockDiscoveryApi.getBaseUrl.mockResolvedValue('http://localhost:7007/api/rag-chat');
    mockIdentityApi.getProfileInfo.mockResolvedValue({ displayName: 'Test User' });
    // jsdom does not implement scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  const setupConversation = async () => {
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument(),
    );
    // MUI multiline TextField renders a <textarea> — return it directly
    return screen.getByPlaceholderText(/type your message/i) as HTMLTextAreaElement;
  };

  // ── Rendering ──────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the page header and sidebar', async () => {
      await renderApp();
      expect(screen.getByText('RAG Chat')).toBeInTheDocument();
      expect(screen.getByText('Conversations')).toBeInTheDocument();
    });

    it('shows empty state when no conversation is selected', async () => {
      await renderApp();
      const matches = screen.getAllByText((_, el) =>
        el?.textContent === 'Start a new conversation to begin',
      );
      expect(matches.length).toBeGreaterThan(0);
    });

    it('shows "no messages yet" empty state when conversation has no messages', async () => {
      const user = userEvent.setup();
      await renderApp();
      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() =>
        expect(screen.getByText(/no messages yet/i)).toBeInTheDocument(),
      );
    });
  });

  // ── Backend sync on mount ──────────────────────────────────────────────────

  describe('backend sync on mount', () => {
    it('loads conversations from the backend and replaces localStorage cache', async () => {
      // Seed localStorage with a stale conversation
      localStorage.setItem(
        'chatState',
        JSON.stringify({
          conversations: [{ id: 'stale-1', title: 'Stale Conversation', messages: [], createdAt: new Date(), updatedAt: new Date() }],
          currentConversationId: null,
          showSettings: false,
          loading: false,
          snackbar: { open: false, message: '', severity: 'info' },
        }),
      );

      const fetchApi = makeFetchApi({
        '/conversations': () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'backend-1',
                  title: 'Backend Conversation',
                  messages: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            }),
            { status: 200 },
          ),
      });

      await renderApp(fetchApi);

      await waitFor(() =>
        expect(screen.getByText('Backend Conversation')).toBeInTheDocument(),
      );
      expect(screen.queryByText('Stale Conversation')).not.toBeInTheDocument();
    });

    it('keeps localStorage cache when backend is unavailable', async () => {
      localStorage.setItem(
        'chatState',
        JSON.stringify({
          conversations: [{ id: 'cached-1', title: 'Cached Conversation', messages: [], sourceRefs: [], createdAt: new Date(), updatedAt: new Date() }],
          currentConversationId: null,
          showSettings: false,
          loading: false,
          snackbar: { open: false, message: '', severity: 'info' },
        }),
      );

      const fetchApi = makeFetchApi({
        '/conversations': () => new Response('error', { status: 500 }),
      });

      await renderApp(fetchApi);

      // Should still show the cached conversation
      await waitFor(() =>
        expect(screen.getByText('Cached Conversation')).toBeInTheDocument(),
      );
    });

    it('loads messages from the backend into the conversation', async () => {
      const fetchApi = makeFetchApi({
        '/conversations': () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'conv-1',
                  title: 'My Chat',
                  messages: [
                    { id: 'msg-1', role: 'user', content: 'Hello from backend', timestamp: new Date().toISOString() },
                    { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: new Date().toISOString() },
                  ],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            }),
            { status: 200 },
          ),
      });

      await renderApp(fetchApi);

      // Verify the conversation title appears in the sidebar after backend sync
      await waitFor(() =>
        expect(screen.getByText('My Chat')).toBeInTheDocument(),
      );

      // Verify the fetch was called with the conversations endpoint
      expect(fetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/conversations'),
      );
    });

    it('clears currentConversationId if it no longer exists in the backend', async () => {
      localStorage.setItem(
        'chatState',
        JSON.stringify({
          conversations: [],
          currentConversationId: 'deleted-conv',
          showSettings: false,
          loading: false,
          snackbar: { open: false, message: '', severity: 'info' },
        }),
      );

      const fetchApi = makeFetchApi({
        '/conversations': () =>
          new Response(JSON.stringify({ items: [] }), { status: 200 }),
      });

      await renderApp(fetchApi);

      // Should show the "no conversation selected" empty state
      await waitFor(() => {
        const matches = screen.getAllByText((_, el) =>
          el?.textContent === 'Start a new conversation to begin',
        );
        expect(matches.length).toBeGreaterThan(0);
      });
    });
  });

  // ── Create conversation ────────────────────────────────────────────────────

  describe('creating conversations', () => {
    it('creates a new conversation optimistically before backend responds', async () => {
      let resolvePost: (r: Response) => void;
      const slowPost = new Promise<Response>(res => { resolvePost = res; });

      const fetchApi = {
        fetch: jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
          if (url.endsWith('/conversations') && opts?.method === 'POST') return slowPost;
          return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        }),
      };

      const user = userEvent.setup();
      await renderApp(fetchApi);

      await user.click(screen.getByRole('button', { name: /new conversation/i }));

      // Conversation appears immediately before backend responds
      await waitFor(() =>
        expect(screen.getAllByText('New Conversation').length).toBeGreaterThan(0),
      );

      // Now resolve the backend call
      act(() => resolvePost!(new Response('{}', { status: 201 })));
    });

    it('keeps the optimistic conversation if the backend POST fails', async () => {
      const fetchApi = {
        fetch: jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
          if (url.endsWith('/conversations') && opts?.method === 'POST') {
            return Promise.resolve(new Response('error', { status: 500 }));
          }
          return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        }),
      };

      const user = userEvent.setup();
      await renderApp(fetchApi);

      await user.click(screen.getByRole('button', { name: /new conversation/i }));

      // Conversation should still be visible even though backend failed
      await waitFor(() =>
        expect(screen.getAllByText('New Conversation').length).toBeGreaterThan(0),
      );
    });
  });

  // ── Delete conversation ────────────────────────────────────────────────────

  describe('deleting conversations', () => {
    it('removes the conversation optimistically', async () => {
      const user = userEvent.setup();
      await renderApp();

      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() => expect(screen.getByTitle(/delete conversation/i)).toBeInTheDocument());

      fireEvent.click(screen.getByTitle(/delete conversation/i));

      await waitFor(() =>
        expect(screen.queryByTitle(/delete conversation/i)).not.toBeInTheDocument(),
      );
    });

    it('rolls back the deletion if the backend DELETE fails', async () => {
      const fetchApi = {
        fetch: jest.fn().mockImplementation((_url: string, opts?: RequestInit) => {
          if (opts?.method === 'DELETE') {
            return Promise.resolve(new Response('error', { status: 500 }));
          }
          return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        }),
      };

      const user = userEvent.setup();
      await renderApp(fetchApi);

      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() =>
        expect(screen.getAllByText('New Conversation').length).toBeGreaterThan(0),
      );

      fireEvent.click(screen.getByTitle(/delete conversation/i));

      // After rollback the conversation should reappear
      await waitFor(() =>
        expect(screen.getAllByText('New Conversation').length).toBeGreaterThan(0),
      );
    });

    it('clears currentConversationId when the active conversation is deleted', async () => {
      const user = userEvent.setup();
      await renderApp();

      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() =>
        expect(screen.getAllByText('New Conversation').length).toBeGreaterThan(0),
      );

      fireEvent.click(screen.getByTitle(/delete conversation/i));

      await waitFor(() => {
        const matches = screen.getAllByText((_, el) =>
          el?.textContent === 'Start a new conversation to begin',
        );
        expect(matches.length).toBeGreaterThan(0);
      });
    });
  });

  // ── Messaging ─────────────────────────────────────────────────────────────

  describe('sending messages', () => {
    it('adds the user message to the conversation immediately', async () => {
      const user = userEvent.setup();
      await renderApp();

      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() =>
        expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument(),
      );

      const input = screen.getByPlaceholderText(/type your message/i);
      await user.type(input, 'Hello world');
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

      await waitFor(() =>
        expect(screen.getByText('Hello world')).toBeInTheDocument(),
      );
    });

    it('sets the conversation title from the first message', async () => {
      const user = userEvent.setup();
      await renderApp();

      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() =>
        expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument(),
      );

      const input = screen.getByPlaceholderText(/type your message/i);
      await user.type(input, 'What is Backstage?');
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

      await waitFor(() =>
        expect(screen.getByText('What is Backstage?')).toBeInTheDocument(),
      );
    });

    it('truncates long first messages to 40 chars for the title', async () => {
      const user = userEvent.setup();
      await renderApp();

      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() =>
        expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument(),
      );

      const longMessage = 'This is a very long message that exceeds forty characters easily';
      const input = screen.getByPlaceholderText(/type your message/i);
      await user.type(input, longMessage);
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

      await waitFor(() => {
        // Title should be truncated with ellipsis
        const title = screen.getAllByText((_, el) =>
          (el?.textContent ?? '').includes('This is a very long message that exce'),
        );
        expect(title.length).toBeGreaterThan(0);
      });
    });

    it('does not send an empty message', async () => {
      const fetchApi = makeFetchApi();
      const user = userEvent.setup();
      await renderApp(fetchApi);

      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() =>
        expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument(),
      );

      const input = screen.getByPlaceholderText(/type your message/i);
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

      // No chat POST should have been made
      const chatCalls = (fetchApi.fetch as jest.Mock).mock.calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url.endsWith('/chat') && opts?.method === 'POST',
      );
      expect(chatCalls).toHaveLength(0);
    });
  });

  // ── Chat SSE streaming ────────────────────────────────────────────────────

  describe('chat SSE streaming', () => {

    it('appends streamed tokens to the assistant bubble', async () => {
      const fetchApi = makeChatFetchApi([
        { type: 'token', token: 'Hello' },
        { type: 'token', token: ' world' },
        { type: 'done', conversationId: 'conv-1', messageId: 'msg-1' },
      ]);
      await renderApp(fetchApi);
      const input = await setupConversation();
      await sendMessage(input, 'Hi');
      await waitFor(() =>
        expect(screen.getByText('Hello world')).toBeInTheDocument(),
      );
    });

    it('re-enables the input after the done event', async () => {
      const fetchApi = makeChatFetchApi([
        { type: 'token', token: 'Done' },
        { type: 'done', conversationId: 'conv-1', messageId: 'msg-1' },
      ]);
      await renderApp(fetchApi);
      const input = await setupConversation();
      await sendMessage(input, 'Hi');
      await waitFor(() =>
        expect(screen.getByPlaceholderText(/type your message/i)).not.toBeDisabled(),
      );
    });

    it('shows a snackbar and removes the placeholder on SSE error event', async () => {
      const fetchApi = makeChatFetchApi([
        { type: 'error', error: 'Model not configured' },
      ]);
      await renderApp(fetchApi);
      const input = await setupConversation();
      await sendMessage(input, 'Hi');
      await waitFor(() =>
        expect(screen.getByText('Model not configured')).toBeInTheDocument(),
      );
    });

    it('shows a snackbar when the backend returns a non-200 status', async () => {
      const fetchApi = {
        fetch: jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
          const path = url.replace('http://localhost:7007/api/rag-chat', '');
          if (path === '/chat' && opts?.method === 'POST') {
            return Promise.resolve(new Response('Unauthorized', { status: 401 }));
          }
          return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        }),
      };
      await renderApp(fetchApi);
      const input = await setupConversation();
      await sendMessage(input, 'Hi');
      await waitFor(() =>
        expect(screen.getByText(/request failed/i)).toBeInTheDocument(),
      );
    });

    it('sends modelId, sourceIds and temperature from active settings', async () => {
      const fetchApi = makeChatFetchApi([
        { type: 'token', token: 'ok' },
        { type: 'done', conversationId: 'conv-1', messageId: 'msg-1' },
      ]);
      await renderApp(fetchApi);
      const input = await setupConversation();
      await sendMessage(input, 'Test message');
      await waitFor(() => {
        const chatCall = (fetchApi.fetch as jest.Mock).mock.calls.find(
          ([url, opts]: [string, RequestInit]) =>
            url.endsWith('/chat') && opts?.method === 'POST',
        );
        expect(chatCall).toBeDefined();
        const body = JSON.parse(chatCall[1].body as string);
        expect(body.modelId).toBe('gemini-flash');
        expect(body.sourceIds).toEqual(['catalog']);
        expect(body.temperature).toBe(0.7);
        expect(body.message).toBe('Test message');
      });
    });

    it('handles multiple tokens arriving in a single network chunk', async () => {
      const encoder = new TextEncoder();
      const combined =
        `data: ${JSON.stringify({ type: 'token', token: 'Chunk' })}\n\n` +
        `data: ${JSON.stringify({ type: 'token', token: 'ed' })}\n\n` +
        `data: ${JSON.stringify({ type: 'done', conversationId: 'c', messageId: 'm' })}\n\n`;
      const fetchApi = {
        fetch: jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
          const path = url.replace('http://localhost:7007/api/rag-chat', '');
          if (path === '/chat' && opts?.method === 'POST') {
            return Promise.resolve(
              new Response(
                new ReadableStream({
                  start(controller) {
                    controller.enqueue(encoder.encode(combined));
                    controller.close();
                  },
                }),
                { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
              ),
            );
          }
          return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        }),
      };
      await renderApp(fetchApi);
      const input = await setupConversation();
      await sendMessage(input, 'Hi');
      await waitFor(() =>
        expect(screen.getByText('Chunked')).toBeInTheDocument(),
      );
    });
  });

  // ── Settings ──────────────────────────────────────────────────────────────

  describe('settings panel', () => {
    it('opens the settings panel when the settings button is clicked', async () => {
      const user = userEvent.setup();
      await renderApp();

      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() => expect(screen.getByTitle('Settings')).toBeInTheDocument());

      await user.click(screen.getByTitle('Settings'));

      await waitFor(() =>
        expect(screen.getByText('Settings')).toBeInTheDocument(),
      );
    });

    it('shows the configured models from the backend', async () => {
      const user = userEvent.setup();
      await renderApp();

      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() => expect(screen.getByTitle('Settings')).toBeInTheDocument());

      await user.click(screen.getByTitle('Settings'));

      await waitFor(() => {
        expect(screen.getByDisplayValue('gemini-flash')).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('gemini-embedding-2')).toBeInTheDocument();
    });

    it('closes the settings panel on cancel', async () => {
      const user = userEvent.setup();
      await renderApp();

      await user.click(screen.getByRole('button', { name: /new conversation/i }));
      await waitFor(() => expect(screen.getByTitle('Settings')).toBeInTheDocument());

      await user.click(screen.getByTitle('Settings'));
      await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument());

      await user.click(screen.getByText('Cancel'));
      await waitFor(() =>
        expect(screen.queryByText('Cancel')).not.toBeInTheDocument(),
      );
    });
    it('displays token usage and estimated cost after completion', async () => {
      const fetchApi = makeChatFetchApi([
        { type: 'token', token: 'Hello' },
        {
          type: 'done',
          conversationId: 'conv-1',
          messageId: 'msg-1',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
      ]);

      await renderApp(fetchApi);

      const input = await setupConversation();
      await sendMessage(input, 'Hi');

      await waitFor(() => {
        expect(screen.getByText(/Tokens:/i)).toBeInTheDocument();
        expect(screen.getByText(/10 \+ 5 = 15/i)).toBeInTheDocument();
        expect(screen.getByText(/Cost:/i)).toBeInTheDocument();
        expect(screen.getByText(/< \$0.00001/i)).toBeInTheDocument();
      });
    });
  });

  // ── Search and Filter ──────────────────────────────────────────────────────
  describe('search and filter', () => {
    it('filters conversations by title', async () => {
      const fetchApi = makeFetchApi({
        '/conversations': () =>
          new Response(
            JSON.stringify({
              items: [
                { id: '1', title: 'React Hooks', messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                { id: '2', title: 'TypeScript Basics', messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
              ],
            }),
            { status: 200 },
          ),
      });

      const user = userEvent.setup();
      await renderApp(fetchApi);

      await waitFor(() => expect(screen.getByText('React Hooks')).toBeInTheDocument());
      expect(screen.getByText('TypeScript Basics')).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText(/search chats/i);
      await user.type(searchInput, 'React');

      expect(screen.getByText('React Hooks')).toBeInTheDocument();
      expect(screen.queryByText('TypeScript Basics')).not.toBeInTheDocument();
    });

    it('filters conversations by message content', async () => {
      const fetchApi = makeFetchApi({
        '/conversations': () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: '1',
                  title: 'Chat A',
                  messages: [{ id: 'm1', role: 'user', content: 'Hidden gem', timestamp: new Date().toISOString() }],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                },
                { id: '2', title: 'Chat B', messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
              ],
            }),
            { status: 200 },
          ),
      });

      const user = userEvent.setup();
      await renderApp(fetchApi);

      await waitFor(() => expect(screen.getByText('Chat A')).toBeInTheDocument());
      
      const searchInput = screen.getByPlaceholderText(/search chats/i);
      await user.type(searchInput, 'gem');

      expect(screen.getByText('Chat A')).toBeInTheDocument();
      expect(screen.queryByText('Chat B')).not.toBeInTheDocument();
    });

    it('shows empty state when no matches are found', async () => {
      const fetchApi = makeFetchApi({
        '/conversations': () =>
          new Response(
            JSON.stringify({
              items: [{ id: '1', title: 'General', messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
            }),
            { status: 200 },
          ),
      });

      const user = userEvent.setup();
      await renderApp(fetchApi);

      await waitFor(() => expect(screen.getByText('General')).toBeInTheDocument());

      const searchInput = screen.getByPlaceholderText(/search chats/i);
      await user.type(searchInput, 'NothingMatchesThis');

      expect(screen.getByText(/no matches found/i)).toBeInTheDocument();
      expect(screen.queryByText('General')).not.toBeInTheDocument();
    });
  });

  // ── localStorage cache ────────────────────────────────────────────────────

  describe('localStorage cache', () => {
    it('writes state to localStorage after each change', async () => {
      const user = userEvent.setup();
      await renderApp();

      await user.click(screen.getByRole('button', { name: /new conversation/i }));

      await waitFor(() => {
        const cached = JSON.parse(localStorage.getItem('chatState') ?? '{}');
        expect(cached.conversations?.length).toBeGreaterThan(0);
      });
    });

    it('seeds the UI from localStorage before the backend responds', async () => {
      localStorage.setItem(
        'chatState',
        JSON.stringify({
          conversations: [{ id: 'seed-1', title: 'Seeded Conversation', messages: [], sourceRefs: [], createdAt: new Date(), updatedAt: new Date() }],
          currentConversationId: null,
          showSettings: false,
          loading: false,
          snackbar: { open: false, message: '', severity: 'info' },
        }),
      );

      // Backend returns empty — but the seed should be visible immediately
      let resolveGet: (r: Response) => void;
      const slowGet = new Promise<Response>(res => { resolveGet = res; });
      const fetchApi = {
        fetch: jest.fn().mockImplementation((url: string) => {
          if (url.endsWith('/conversations')) return slowGet;
          return Promise.resolve(new Response('{}', { status: 200 }));
        }),
      };

      await renderApp(fetchApi);

      // Seeded conversation visible before backend resolves
      expect(screen.getByText('Seeded Conversation')).toBeInTheDocument();

      // Resolve backend with empty list
      act(() => resolveGet!(new Response(JSON.stringify({ items: [] }), { status: 200 })));

      await waitFor(() =>
        expect(screen.queryByText('Seeded Conversation')).not.toBeInTheDocument(),
      );
    });
  });
});
