// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isChatError } from '../../src/shared/llm/errors.ts';
import type { ChatTurn } from '../../src/shared/llm/protocol.ts';
import { parseChatRequest, trimHistory } from './history.ts';

const turn = (role: ChatTurn['role'], content: string): ChatTurn => ({ role, content });

function errorCode(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return isChatError(error) ? error.info.code : 'not a chat error';
  }
}

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

  it('rejects a newest user turn that alone exceeds the budget (IN-02)', () => {
    expect(
      errorCode(() =>
        trimHistory(
          [turn('user', 'old'), turn('assistant', 'x'), turn('user', 'z'.repeat(101))],
          100,
        ),
      ),
    ).toBe('bad_request');
    expect(trimHistory([turn('user', 'z'.repeat(100))], 100)).toEqual([
      turn('user', 'z'.repeat(100)),
    ]);
  });

  it('counts the merged newest turn, separators included, against the budget (IN-02)', () => {
    // Two 50-character messages merge into 102 characters.
    const twice = [turn('user', 'a'.repeat(50)), turn('user', 'b'.repeat(50))];
    expect(() => trimHistory(twice, 101)).toThrow();
    expect(trimHistory(twice, 102)[0]?.content).toHaveLength(102);
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
