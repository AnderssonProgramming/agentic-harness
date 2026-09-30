import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_MESSAGE_LENGTH } from '../model/message';
import { Composer } from './composer';

function setup(onSend = vi.fn(() => true)) {
  const user = userEvent.setup();
  render(<Composer onSend={onSend} />);
  return {
    user,
    onSend,
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
});
