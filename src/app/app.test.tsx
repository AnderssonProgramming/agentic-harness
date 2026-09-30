import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './app';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('App', () => {
  it('shows the chat at the root with its nav link marked as current', () => {
    render(<App />);
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows a not-found view for unknown paths and links back to the chat', async () => {
    window.history.replaceState(null, '', '/does-not-exist');
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to the chat' }));

    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  });
});
