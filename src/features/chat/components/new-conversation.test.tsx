import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '../model/message';
import { NewConversation } from './new-conversation';

const messages: readonly Message[] = [
  { id: 'id-1', author: 'user', text: 'Hi', createdAt: 1_000, status: 'done', error: null },
];

function setup(list: readonly Message[] = messages) {
  const user = userEvent.setup();
  const onClear = vi.fn();
  const view = render(<NewConversation messages={list} onClear={onClear} />);
  return { user, onClear, view, trigger: screen.getByRole('button', { name: 'New conversation' }) };
}

describe('NewConversation', () => {
  it('is disabled while the conversation is empty', () => {
    expect(setup([]).trigger).toBeDisabled();
  });

  it('asks for confirmation before clearing, and clears on Clear', async () => {
    const { user, onClear, trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole('group', { name: 'Clear this conversation?' })).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('keeps everything on Cancel or Escape and returns focus to the button', async () => {
    const { user, onClear, trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('re-checks canClear in the Clear handler, not only through the disabled state', async () => {
    const { user, onClear, trigger, view } = setup();
    await user.click(trigger);
    view.rerender(<NewConversation messages={[]} onClear={onClear} />);

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).not.toHaveBeenCalled();
  });
});
