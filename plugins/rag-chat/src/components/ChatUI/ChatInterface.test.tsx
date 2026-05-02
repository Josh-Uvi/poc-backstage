import { ChatInterface } from './ChatInterface';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';

describe('ChatInterface', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('should render the chat interface', async () => {
    await renderInTestApp(<ChatInterface />);
    expect(screen.getByText('RAG Chat')).toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
  });

  it('should create a new conversation', async () => {
    const user = userEvent.setup();
    await renderInTestApp(<ChatInterface />);

    const newButton = screen.getByRole('button', { name: /new conversation/i });
    await user.click(newButton);

    await waitFor(() => {
      expect(screen.queryByText(/no conversations yet/i)).not.toBeInTheDocument();
    });
  });

  it('should allow sending messages', async () => {
    const user = userEvent.setup();
    await renderInTestApp(<ChatInterface />);

    // Create a new conversation first
    await user.click(screen.getByRole('button', { name: /new conversation/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type your message/i);
    await user.type(input, 'Hello');

    // Submit via Enter key using fireEvent to avoid Suspense issues
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
  });

  it('should show empty state when no conversation is selected', async () => {
    await renderInTestApp(<ChatInterface />);
    // The main chat area shows this empty state text
    const matches = screen.getAllByText((_, el) =>
      el?.textContent === 'Start a new conversation to begin'
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('should delete a conversation', async () => {
    const user = userEvent.setup();
    await renderInTestApp(<ChatInterface />);

    // Create a conversation
    await user.click(screen.getByRole('button', { name: /new conversation/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/conversation 1/i).length).toBeGreaterThan(0);
    });

    // Click delete via the icon button inside the Tooltip
    const deleteButton = screen.getByTitle(/delete conversation/i);
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryAllByText(/^conversation 1$/i)).toHaveLength(0);
    });
  });
});
