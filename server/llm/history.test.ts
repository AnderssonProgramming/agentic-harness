// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isChatError } from '../../src/shared/llm/errors.ts';
import type { ChatTurn } from '../../src/shared/llm/protocol.ts';
import { parseChatRequest, trimHistory } from './history.ts';

const turn = (role: ChatTurn['role'], content: string): ChatTurn => ({ role, content });

describe('parseChatRequest', () => {
  it('accepts a list of user and assistant turns ending with the user', () => {
    const messages = [turn('user', 'Hi'), turn('assistant', 'Hello'), turn('user', 'Bye')];
    expect(parseChatRequest({ messages })).toEqual(messages);
  });

  it.each([
    ['no body', null],
    ['no messages', {}],
    ['a system role', { messages: [{ role: 'system', content: 'x' }] }],
    ['non-string content', { messages: [{ role: 'user', content: 42 }] }],
    ['an assistant turn last', { messages: [turn('user', 'a'), turn('assistant', 'b')] }],
    ['an empty list', { messages: [] }],
  ])('rejects %s as bad_request', (_, body) => {
    let code = 'did not throw';
    try {
      parseChatRequest(body);
    } catch (error) {
      code = isChatError(error) ? error.info.code : 'not a ChatError';
    }
    expect(code).toBe('bad_request');
  });
});

describe('trimHistory', () => {
  it('sends the whole conversation while it fits the budget', () => {
    const messages = [turn('user', 'one'), turn('assistant', 'two'), turn('user', 'three')];
    expect(trimHistory(messages, 1000)).toEqual(messages);
  });

  it('drops the oldest turns first and never starts with the assistant', () => {
    const messages = [
      turn('user', 'a'.repeat(50)),
      turn('assistant', 'b'.repeat(50)),
      turn('user', 'c'.repeat(50)),
      turn('assistant', 'd'.repeat(50)),
      turn('user', 'e'.repeat(50)),
    ];
    const trimmed = trimHistory(messages, 160);
    expect(trimmed.map((t) => t.content[0])).toEqual(['c', 'd', 'e']);
  });

  it('keeps the newest user turn even when it alone exceeds the budget', () => {
    const trimmed = trimHistory(
      [turn('user', 'old'), turn('assistant', 'x'), turn('user', 'z'.repeat(500))],
      100,
    );
    expect(trimmed).toEqual([turn('user', 'z'.repeat(500))]);
  });

  it('merges consecutive turns from the same role and skips empty ones', () => {
    // e.g. a user message whose reply failed, followed by a retry
    const trimmed = trimHistory(
      [turn('user', 'first'), turn('assistant', '  '), turn('user', 'second')],
      1000,
    );
    expect(trimmed).toEqual([turn('user', 'first\n\nsecond')]);
  });
});
