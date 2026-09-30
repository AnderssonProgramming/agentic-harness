export type Author = 'user' | 'assistant';

export interface Message {
  id: string;
  author: Author;
  text: string;
  createdAt: number;
}

export interface MessageSource {
  newId: () => string;
  now: () => number;
}

export type DraftCheck =
  { valid: true; text: string } | { valid: false; reason: 'empty' | 'too-long' };

export const MAX_MESSAGE_LENGTH = 4000;

// Sprint 1 has no model connection (CLAUDE.md), so every message gets this fixed reply until B-03.
export const PLACEHOLDER_REPLY =
  "I can't answer yet: my model connection arrives with backlog item B-03. Your message was saved for this session.";

export function checkDraft(draft: string): DraftCheck {
  const text = draft.trim();
  if (text.length === 0) return { valid: false, reason: 'empty' };
  if (text.length > MAX_MESSAGE_LENGTH) return { valid: false, reason: 'too-long' };
  return { valid: true, text };
}

export function createMessage(author: Author, text: string, source: MessageSource): Message {
  return { id: source.newId(), author, text, createdAt: source.now() };
}

export function appendExchange(
  messages: readonly Message[],
  draft: string,
  source: MessageSource,
): readonly Message[] {
  const check = checkDraft(draft);
  if (!check.valid) return messages;
  return [
    ...messages,
    createMessage('user', check.text, source),
    createMessage('assistant', PLACEHOLDER_REPLY, source),
  ];
}
