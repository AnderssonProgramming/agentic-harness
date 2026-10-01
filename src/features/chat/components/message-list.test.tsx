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
});
const reply = (id: string, text: string, rest: Partial<Message> = {}): Message => ({
  id,
  author: 'assistant',
  text,
  createdAt: 2,
  status: 'done',
  error: null,
  ...rest,
});

describe('MessageList', () => {
  it('explains what to do when there are no messages', () => {
    render(<MessageList messages={[]} onRetry={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /ask compass/i })).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('renders messages in order, newest last, with distinct author styling', () => {
    render(
      <MessageList
        messages={[user('1', 'How do we name branches?'), reply('2', 'Ask your lead.')]}
        onRetry={vi.fn()}
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
      />,
    );
    expect(screen.getByRole('status', { name: 'Compass is typing' })).toBeInTheDocument();
    expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'true');

    rerender(
      <MessageList
        messages={[user('1', 'Hi'), reply('2', 'Hel', { status: 'streaming' })]}
        onRetry={vi.fn()}
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
      />,
    );
    expect(screen.getByText('Once upon')).toBeInTheDocument();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });
});
