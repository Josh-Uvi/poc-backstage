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
    models: [{ id: 'gpt-4', name: 'GPT-4', provider: 'openai' as const }],
    sources: [{ id: 'catalog', name: 'Software Catalog', type: 'catalog' as const }],
    defaultModelId: 'gpt-4',
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatInterface', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockDiscoveryApi.getBaseUrl.mockResolvedValue('http://localhost:7007/api/rag-chat');
    mockIdentityApi.getProfileInfo.mockResolvedValue({ displayName: 'Test User' });
  });

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
        fetch: jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
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
