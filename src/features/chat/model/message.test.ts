import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE_LENGTH,
  PLACEHOLDER_REPLY,
  appendExchange,
  checkDraft,
  type MessageSource,
} from './message';

function fakeSource(): MessageSource {
  let counter = 0;
  return { newId: () => `id-${String(++counter)}`, now: () => 1_000 };
}

describe('checkDraft', () => {
  it('rejects empty and whitespace-only drafts', () => {
    expect(checkDraft('')).toEqual({ valid: false, reason: 'empty' });
    expect(checkDraft('   \n\t ')).toEqual({ valid: false, reason: 'empty' });
  });

  it('rejects drafts over the length limit', () => {
    expect(checkDraft('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toEqual({
      valid: false,
      reason: 'too-long',
    });
  });

  it('accepts a draft exactly at the limit', () => {
    expect(checkDraft('a'.repeat(MAX_MESSAGE_LENGTH)).valid).toBe(true);
  });

  it('trims surrounding whitespace but keeps inner new lines', () => {
    expect(checkDraft('  line one\nline two  ')).toEqual({
      valid: true,
      text: 'line one\nline two',
    });
  });
});

describe('appendExchange', () => {
  it('appends the user message and then the local assistant reply at the end', () => {
    const source = fakeSource();
    const first = appendExchange([], 'Hello', source);
    const second = appendExchange(first, 'Where are the docs?', source);

    expect(second.map((m) => [m.author, m.text])).toEqual([
      ['user', 'Hello'],
      ['assistant', PLACEHOLDER_REPLY],
      ['user', 'Where are the docs?'],
      ['assistant', PLACEHOLDER_REPLY],
    ]);
    expect(new Set(second.map((m) => m.id)).size).toBe(4);
  });

  it('returns the same list untouched for an invalid draft', () => {
    const messages = appendExchange([], 'Hi', fakeSource());
    expect(appendExchange(messages, '   ', fakeSource())).toBe(messages);
  });

  it('does not mutate the previous list', () => {
    const messages = appendExchange([], 'Hi', fakeSource());
    appendExchange(messages, 'Again', fakeSource());
    expect(messages).toHaveLength(2);
  });
});
