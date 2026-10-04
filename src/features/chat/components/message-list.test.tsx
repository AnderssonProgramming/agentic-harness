import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { chatError } from '../../../shared/llm/errors';
import type { Message } from '../model/message';
import { MessageList } from './message-list';

const user = (id: string, text: string): Message => ({
  id,
  author: 'user',
  text,
  createdAt: 1,
  status: 'done',
  error: null,
  actions: [],
});
const reply = (id: string, text: string, rest: Partial<Message> = {}): Message => ({
  id,
  author: 'assistant',
  text,
  createdAt: 2,
  status: 'done',
  error: null,
  actions: [],
  ...rest,
});
// No Sources lines in these tests; the citation props are covered in source-chips.test.tsx.
const NO_SOURCES = { documents: null, onOpenSource: () => undefined };

describe('MessageList', () => {
  it('explains what to do when there are no messages', () => {
    render(<MessageList messages={[]} onRetry={vi.fn()} {...NO_SOURCES} onAsk={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /ask compass/i })).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('offers the 4 starter questions only while the conversation is empty (B-10)', async () => {
    const onAsk = vi.fn();
    const { rerender } = render(
      <MessageList messages={[]} onRetry={vi.fn()} {...NO_SOURCES} onAsk={onAsk} />,
    );
    const suggestions = () => screen.queryByRole('list', { name: 'Suggested questions' });
    const list = screen.getByRole('list', { name: 'Suggested questions' });
    expect(within(list).getAllByRole('button')).toHaveLength(4);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'How do deploys work here?' }));
    expect(onAsk).toHaveBeenCalledWith('How do deploys work here?');

    rerender(
      <MessageList messages={[user('1', 'Hi')]} onRetry={vi.fn()} {...NO_SOURCES} onAsk={onAsk} />,
    );
    expect(suggestions()).not.toBeInTheDocument();
  });

  it('renders messages in order, newest last, with distinct author styling', () => {
    render(
      <MessageList
        messages={[user('1', 'How do we name branches?'), reply('2', 'Ask your lead.')]}
        onRetry={vi.fn()}
        {...NO_SOURCES}
        onAsk={vi.fn()}
      />,
    );
    const [mine, theirs] = within(screen.getByRole('log')).getAllByRole('listitem');
    expect(mine).toHaveTextContent('YouHow do we name branches?');
    expect(mine).toHaveClass('message--user');
    expect(theirs).toHaveTextContent('CompassAsk your lead.');
    expect(theirs).toHaveClass('message--assistant');
  });

  it('shows a typing indicator before the first words arrive, then the streaming text', () => {
    const { rerender } = render(
      <MessageList
        messages={[user('1', 'Hi'), reply('2', '', { status: 'streaming' })]}
        onRetry={vi.fn()}
        {...NO_SOURCES}
        onAsk={vi.fn()}
      />,
    );
    expect(screen.getByRole('status', { name: 'Compass is typing' })).toBeInTheDocument();
    expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'true');

    rerender(
      <MessageList
        messages={[user('1', 'Hi'), reply('2', 'Hel', { status: 'streaming' })]}
        onRetry={vi.fn()}
        {...NO_SOURCES}
        onAsk={vi.fn()}
      />,
    );
    expect(screen.queryByRole('status', { name: 'Compass is typing' })).not.toBeInTheDocument();
    expect(screen.getByText('Hel')).toBeInTheDocument();
  });

  it('shows an understandable error that names the engine, and retries the last reply', async () => {
    const onRetry = vi.fn();
    const error = chatError('engine_unreachable', 'ECONNREFUSED', 'ollama').info;
    render(
      <MessageList
        messages={[user('1', 'Hi'), reply('2', '', { status: 'error', error })]}
        onRetry={onRetry}
        {...NO_SOURCES}
        onAsk={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent("Ollama isn't running on this computer");
    expect(screen.getByRole('alert')).not.toHaveTextContent('ECONNREFUSED');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith('2');
  });

  it('offers no Retry when retrying cannot help, or on an older reply', () => {
    const auth = chatError('auth', '401', 'anthropic').info;
    const network = chatError('network', 'x').info;
    render(
      <MessageList
        messages={[
          user('1', 'a'),
          reply('2', '', { status: 'error', error: network }),
          user('3', 'b'),
          reply('4', '', { status: 'error', error: auth }),
        ]}
        onRetry={vi.fn()}
        {...NO_SOURCES}
        onAsk={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('marks a stopped reply and keeps its partial text', () => {
    render(
      <MessageList
        messages={[user('1', 'Hi'), reply('2', 'Once upon', { status: 'stopped' })]}
        onRetry={vi.fn()}
        {...NO_SOURCES}
        onAsk={vi.fn()}
      />,
    );
    expect(screen.getByText('Once upon')).toBeInTheDocument();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it("shows the app's to-do card for a reply with an action, pending then settled (B-11)", () => {
    const pending = reply('r1', '', {
      status: 'streaming',
      actions: [{ status: 'pending', request: { kind: 'list' } }],
    });
    const { rerender } = render(
      <MessageList
        messages={[user('u1', "What's on my list?"), pending]}
        onRetry={vi.fn()}
        {...NO_SOURCES}
        onAsk={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Updating your list…');
    expect(screen.queryByLabelText('Compass is typing')).not.toBeInTheDocument();

    const settled = reply('r1', '', {
      actions: [{ status: 'settled', card: { kind: 'listed', todos: [] } }],
    });
    rerender(
      <MessageList
        messages={[user('u1', "What's on my list?"), settled]}
        onRetry={vi.fn()}
        {...NO_SOURCES}
        onAsk={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Your list is empty.');
  });

  it('shows one card per action of a reply, in order (Amendment 1)', () => {
    const two = reply('r1', '', {
      actions: [
        {
          status: 'settled',
          card: { kind: 'added', todo: { id: 't1', text: 'read the guide', done: false } },
        },
        { status: 'settled', card: { kind: 'unsupported', action: 'list' } },
      ],
    });
    const { container } = render(
      <MessageList
        messages={[user('u1', 'x'), two]}
        onRetry={vi.fn()}
        {...NO_SOURCES}
        onAsk={vi.fn()}
      />,
    );
    expect(
      [...container.querySelectorAll('.todo-card')].map((card) => card.getAttribute('data-card')),
    ).toEqual(['added', 'unsupported']);
  });
});
