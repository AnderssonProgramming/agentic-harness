import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SourcePanel, type SourcePanelDocument } from './source-panel';

const doc = (rest: Partial<SourcePanelDocument> = {}): SourcePanelDocument => ({
  source: 'branch-naming.md',
  title: 'Branch naming',
  state: 'ready',
  text: '# Branch naming\n\nUse `<type>/<id>`. <img src=x onerror="alert(1)"> **bold**',
  ...rest,
});

describe('SourcePanel (B-07)', () => {
  it("shows the document's text as plain text, never as HTML or Markdown", () => {
    const { container } = render(<SourcePanel document={doc()} onClose={vi.fn()} />);
    const panel = screen.getByRole('dialog', { name: /Branch naming/ });
    expect(panel).toHaveTextContent('<img src=x onerror="alert(1)"> **bold**');
    expect(container.querySelector('img, strong, h1')).toBeNull();
    expect(panel.querySelector('pre')?.textContent).toBe(doc().text);
  });

  it('moves focus into the panel when it opens', () => {
    render(<SourcePanel document={doc()} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Branch naming/ })).toHaveFocus();
  });

  it('closes with the close button and with Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SourcePanel document={doc()} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close document' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    screen.getByRole('heading', { name: /Branch naming/ }).focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows loading and error states', () => {
    const { rerender } = render(
      <SourcePanel document={doc({ state: 'loading', text: '' })} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading the document');
    rerender(<SourcePanel document={doc({ state: 'error', text: '' })} onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't be loaded");
  });
});
