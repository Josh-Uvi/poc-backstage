import { ChatInterface } from './ChatInterface';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { ragChatConfigApiRef } from '../../api';

const mockConfigApi = {
  getConfig: () => ({
    models: [
      { id: 'gpt-4', name: 'GPT-4', provider: 'openai' as const },
    ],
    sources: [
      { id: 'catalog', name: 'Software Catalog', type: 'catalog' as const },
    ],
    defaultModelId: 'gpt-4',
    defaultSourceIds: ['catalog'],
  }),
};

const renderApp = () =>
  renderInTestApp(<ChatInterface />, {
    apis: [[ragChatConfigApiRef, mockConfigApi]],
  });

describe('ChatInterface', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should render the chat interface', async () => {
    await renderApp();
    expect(screen.getByText('RAG Chat')).toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
  });

  it('should create a new conversation', async () => {
    const user = userEvent.setup();
    await renderApp();

    const newButton = screen.getByRole('button', { name: /new conversation/i });
    await user.click(newButton);

    await waitFor(() => {
      expect(screen.queryByText(/no conversations yet/i)).not.toBeInTheDocument();
    });
  });

  it('should allow sending messages', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: /new conversation/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type your message/i);
    await user.type(input, 'Hello');

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
  });

  it('should show empty state when no conversation is selected', async () => {
    await renderApp();
    const matches = screen.getAllByText((_, el) =>
      el?.textContent === 'Start a new conversation to begin'
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('should delete a conversation', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: /new conversation/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/new conversation/i).length).toBeGreaterThan(0);
    });

    const deleteButton = screen.getByTitle(/delete conversation/i);
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByTitle(/delete conversation/i)).not.toBeInTheDocument();
    });
  });
});
