import { describe, expect, it } from 'vitest';
import { requestBody } from './client';
import { fitHistory } from './history-budget';
import { MAX_HISTORY_CHARS } from './limits';
import type { ChatTurn } from './protocol';

const turn = (role: ChatTurn['role'], content: string): ChatTurn => ({ role, content });

describe('fitHistory (P-01)', () => {
  it('keeps everything while it fits, from the first message', () => {
    const messages = [turn('user', 'a'), turn('assistant', 'b'), turn('user', 'c')];
    expect(fitHistory(messages, 100)).toEqual({ turns: messages, from: 0, fits: true });
  });

  it('starts at the first message of the oldest merged turn it keeps', () => {
    const messages = [
      turn('user', 'x'.repeat(50)),
      turn('assistant', 'y'.repeat(50)),
      turn('user', 'one'),
      turn('user', ''),
      turn('user', 'two'),
      turn('assistant', 'reply'),
      turn('user', 'three'),
    ];
    const fitted = fitHistory(messages, 30);
    expect(fitted.from).toBe(2);
    expect(fitted.turns).toEqual([
      turn('user', 'one\n\ntwo'),
      turn('assistant', 'reply'),
      turn('user', 'three'),
    ]);
    // What the server rebuilds from the messages sent is what it would keep from all of them.
    expect(fitHistory(messages.slice(fitted.from), 30).turns).toEqual(fitted.turns);
  });

  it('never starts with the assistant', () => {
    const messages = [turn('user', 'x'.repeat(20)), turn('assistant', 'b'), turn('user', 'c')];
    expect(fitHistory(messages, 5)).toEqual({ turns: [turn('user', 'c')], from: 2, fits: true });
  });

  it('reports a newest merged turn over the budget, with all its messages', () => {
    const messages = [
      turn('assistant', 'a'),
      turn('user', 'x'.repeat(6)),
      turn('user', 'y'.repeat(6)),
    ];
    expect(fitHistory(messages, 13)).toEqual({
      turns: [turn('user', `${'x'.repeat(6)}\n\n${'y'.repeat(6)}`)],
      from: 1,
      fits: false,
    });
  });
});

describe('requestBody (P-01)', () => {
  it('sends only the newest messages of a 300 KB conversation that fit the history budget', () => {
    const conversation = Array.from({ length: 150 }, (_, index) =>
      turn(index % 2 === 0 ? 'user' : 'assistant', `${String(index)}:${'w'.repeat(1995)}`),
    );
    expect(JSON.stringify(conversation).length).toBeGreaterThan(300_000);
    const todos = [{ id: 't1', text: 'ask Ana how deploys work' }];

    const body = JSON.parse(requestBody(conversation, todos)) as {
      messages: ChatTurn[];
      todos: unknown;
    };
    const total = body.messages.reduce((sum, message) => sum + message.content.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_HISTORY_CHARS);
    expect(body.messages.length).toBeGreaterThan(1);
    // The newest messages, unchanged and in order.
    expect(body.messages).toEqual(conversation.slice(-body.messages.length));
    expect(body.todos).toEqual(todos);
  });
});
