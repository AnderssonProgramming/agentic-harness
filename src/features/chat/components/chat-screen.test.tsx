import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_REPLY } from '../model/message';
import { ChatScreen } from './chat-screen';

describe('ChatScreen', () => {
  it('shows a sent message at the bottom of the list, followed by the local reply', async () => {
    const user = userEvent.setup();
    render(<ChatScreen />);
    expect(screen.getByRole('heading', { name: /ask compass/i })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'How do we name branches?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Thanks!{Enter}');

    const items = within(screen.getByRole('log')).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[2]).toHaveTextContent('Thanks!');
    expect(items[3]).toHaveTextContent(PLACEHOLDER_REPLY);
  });
});
