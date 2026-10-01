import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatError } from '../../../shared/llm/errors';
import { sendChat, type SendChat } from '../api/chat-api';
import { conversationStore } from '../api/conversation-store';
import { ChatScreen } from './chat-screen';

vi.mock('../api/chat-api', () => ({ sendChat: vi.fn() }));
const mockedSend = vi.mocked(sendChat);

afterEach(() => {
  mockedSend.mockReset();
  // The screen saves to the real (jsdom) storage; each test starts from an empty conversation.
  conversationStore.clear();
});

/** A fake model that echoes the question back in two chunks. */
const echo: SendChat = (history, { onDelta }) => {
  const question = history.at(-1)?.content ?? '';
  onDelta('Re: ');
  onDelta(question);
  return Promise.resolve();
};

describe('ChatScreen', () => {
  it('sends a message, streams the reply under it, and keeps the conversation', async () => {
    mockedSend.mockImplementation(echo);
    const user = userEvent.setup();
    render(<ChatScreen />);
    expect(screen.getByRole('heading', { name: /ask compass/i })).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: 'Message' }),
      'How do we name branches?{Enter}',
    );
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Thanks!{Enter}');

    await waitFor(() => {
      expect(within(screen.getByRole('log')).getAllByRole('listitem')).toHaveLength(4);
    });
    const items = within(screen.getByRole('log')).getAllByRole('listitem');
    expect(items[1]).toHaveTextContent('Re: How do we name branches?');
    expect(items[3]).toHaveTextContent('Re: Thanks!');
    expect(mockedSend.mock.calls[1]?.[0]).toHaveLength(3);
  });

  it('shows an understandable error when the network is down, and recovers on Retry', async () => {
    mockedSend
      .mockRejectedValueOnce(chatError('network', 'Failed to fetch'))
      .mockImplementation(echo);
    const user = userEvent.setup();
    render(<ChatScreen />);

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Hello{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your internet connection');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(within(screen.getByRole('log')).getAllByRole('listitem')[1]).toHaveTextContent(
      'Re: Hello',
    );
  });

  it('keeps the conversation on Cancel and clears it after confirming', async () => {
    mockedSend.mockImplementation(echo);
    const user = userEvent.setup();
    render(<ChatScreen />);
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Hello{Enter}');
    await waitFor(() => {
      expect(within(screen.getByRole('log')).getAllByRole('listitem')).toHaveLength(2);
    });

    await user.click(screen.getByRole('button', { name: 'New conversation' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(within(screen.getByRole('log')).getAllByRole('listitem')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'New conversation' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('heading', { name: /ask compass/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeDisabled();
    expect(conversationStore.load()).toEqual({
      ok: true,
      conversation: { messages: [], outcome: 'empty' },
    });
  });

  it('keeps answering and shows a notice when the conversation cannot be saved', async () => {
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    mockedSend.mockImplementation(echo);
    const user = userEvent.setup();
    render(<ChatScreen />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Hello{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent(/storage is full/);
    await waitFor(() => {
      expect(within(screen.getByRole('log')).getAllByRole('listitem')[1]).toHaveTextContent(
        'Re: Hello',
      );
    });
    full.mockRestore();
  });
});
