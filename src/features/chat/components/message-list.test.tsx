import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Message } from '../model/message';
import { MessageList } from './message-list';

const messages: Message[] = [
  { id: '1', author: 'user', text: 'How do we name branches?', createdAt: 1 },
  { id: '2', author: 'assistant', text: 'Local reply', createdAt: 2 },
];

describe('MessageList', () => {
  it('explains what to do when there are no messages', () => {
    render(<MessageList messages={[]} />);
    expect(screen.getByRole('heading', { name: /ask compass/i })).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('renders messages in order, newest last', () => {
    render(<MessageList messages={messages} />);
    const items = within(screen.getByRole('log')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'YouHow do we name branches?',
      'CompassLocal reply',
    ]);
  });

  it('marks user and assistant messages differently', () => {
    render(<MessageList messages={messages} />);
    const [mine, theirs] = within(screen.getByRole('log')).getAllByRole('listitem');
    expect(mine).toHaveClass('message--user');
    expect(theirs).toHaveClass('message--assistant');
  });
});
