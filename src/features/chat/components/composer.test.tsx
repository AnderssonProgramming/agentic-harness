import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_MESSAGE_LENGTH } from '../model/message';
import { Composer } from './composer';

function setup(onSend = vi.fn(() => true)) {
  const user = userEvent.setup();
  const onStop = vi.fn();
  const view = render(<Composer onSend={onSend} onStop={onStop} replying={false} />);
  return {
    user,
    onSend,
    onStop,
    view,
    input: screen.getByRole('textbox', { name: 'Message' }),
    send: screen.getByRole('button', { name: 'Send' }),
  };
}

describe('Composer', () => {
  it('disables Send for empty and whitespace-only drafts', async () => {
    const { user, input, send, onSend } = setup();
    expect(send).toBeDisabled();

    await user.type(input, '   ');
    expect(send).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends with the button, then clears the input and keeps focus', async () => {
    const { user, input, send, onSend } = setup();
    await user.type(input, 'Hello');
    await user.click(send);

    expect(onSend).toHaveBeenCalledWith('Hello');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('sends on Enter and inserts a new line on Shift+Enter', async () => {
    const { user, input, onSend } = setup();
    await user.type(input, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(input).toHaveValue('line one\nline two');
    expect(onSend).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('line one\nline two');
  });

  it('keeps the draft when the send is rejected', async () => {
    const { user, input } = setup(vi.fn(() => false));
    await user.type(input, 'Hello{Enter}');
    expect(input).toHaveValue('Hello');
  });

  it('blocks drafts over the limit and shows the counter', () => {
    const { input, send } = setup();
    fireEvent.change(input, { target: { value: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) } });

    expect(send).toBeDisabled();
    expect(screen.getByText(/too long/i)).toHaveTextContent(
      `Too long: ${String(MAX_MESSAGE_LENGTH + 1)} / ${String(MAX_MESSAGE_LENGTH)}`,
    );
  });

  it('while a reply streams, blocks sending, turns Send into Stop, and keeps the next draft', async () => {
    const { user, input, onSend, onStop, view } = setup();
    view.rerender(<Composer onSend={onSend} onStop={onStop} replying />);

    await user.type(input, 'Next question{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('Next question');
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    expect(screen.getByText(/Compass is replying/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(input).toHaveFocus();

    view.rerender(<Composer onSend={onSend} onStop={onStop} replying={false} />);
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith('Next question');
  });
});
