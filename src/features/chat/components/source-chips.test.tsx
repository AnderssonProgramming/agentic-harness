import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeDoc } from '../../../shared/llm/protocol';
import type { Message } from '../model/message';
import { MessageList } from './message-list';

const LOADED: KnowledgeDoc[] = [
  { source: 'branch-naming.md', title: 'Branch naming' },
  { source: 'code-review.md', title: 'Code review' },
];

const reply = (text: string, status: Message['status'] = 'done'): Message => ({
  id: 'r1',
  author: 'assistant',
  text,
  createdAt: 1,
  status,
  error: null,
  actions: [],
});

function renderReply(
  text: string,
  {
    status,
    documents = LOADED,
  }: { status?: Message['status']; documents?: KnowledgeDoc[] | null } = {},
) {
  const onOpenSource = vi.fn();
  render(
    <MessageList
      messages={[reply(text, status)]}
      onRetry={vi.fn()}
      onAsk={vi.fn()}
      documents={documents}
      onOpenSource={onOpenSource}
    />,
  );
  // The log holds this one reply (its chips are list items too).
  return { onOpenSource, item: screen.getByRole('log') };
}

describe('Source chips in a reply (B-07)', () => {
  it('shows a known source as a chip that opens it, and hides the raw Sources line', async () => {
    const { onOpenSource, item } = renderReply(
      'Use `feat/b-07-x`.\n\nSources: branch-naming.md, code-review.md',
    );
    expect(item).not.toHaveTextContent('Sources: branch-naming.md');
    const sources = within(item).getByRole('list', { name: 'Sources' });
    expect(
      within(sources)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['branch-naming.md', 'code-review.md']);

    const chip = within(sources).getByRole('button', { name: 'branch-naming.md' });
    await userEvent.setup().click(chip);
    expect(onOpenSource).toHaveBeenCalledWith('branch-naming.md', chip);
  });

  it('shows an invented name as plain text marked "not a known document", never clickable', async () => {
    const { onOpenSource, item } = renderReply(
      'Answer.\nSources: branch-naming.md, invented-guide.md',
    );
    const invented = within(item).getByText('invented-guide.md');
    expect(invented).toHaveTextContent('invented-guide.md (not a known document)');
    expect(invented.closest('button')).toBeNull();
    expect(within(item).getAllByRole('button')).toHaveLength(1);

    await userEvent.setup().click(invented);
    expect(onOpenSource).not.toHaveBeenCalled();
  });

  it('shows no source when the answer says the documents do not cover it', () => {
    const { item } = renderReply("Our team documents don't cover this. Ask your onboarding buddy.");
    expect(within(item).queryByRole('list', { name: 'Sources' })).not.toBeInTheDocument();
    expect(item).toHaveTextContent("Our team documents don't cover this.");
  });

  it('marks names as unchecked, and not clickable, when the document list is unavailable', () => {
    const { item } = renderReply('Answer.\nSources: branch-naming.md', { documents: null });
    expect(within(item).queryByRole('button')).not.toBeInTheDocument();
    expect(within(item).getByText('branch-naming.md')).toHaveTextContent("(couldn't be checked)");
  });

  it('leaves a streaming reply as received, with no chips yet', () => {
    const { item } = renderReply('Answer.\nSources: branch-na', { status: 'streaming' });
    expect(item).toHaveTextContent('Sources: branch-na');
    expect(within(item).queryByRole('list', { name: 'Sources' })).not.toBeInTheDocument();
  });
});
