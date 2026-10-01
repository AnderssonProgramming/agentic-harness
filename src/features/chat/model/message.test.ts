import { describe, expect, it } from 'vitest';
import { chatError } from '../../../shared/llm/errors';
import {
  MAX_MESSAGE_LENGTH,
  appendToReply,
  canClear,
  checkDraft,
  failReply,
  finishReply,
  historyBefore,
  isReplying,
  resetReply,
  settleAction,
  startAction,
  startExchange,
  type Message,
  type MessageSource,
} from './message';
import type { TodoCard } from '../../todos';

function fakeSource(): MessageSource {
  let counter = 0;
  return { newId: () => `id-${String(++counter)}`, now: () => 1_000 };
}

/** Runs one full exchange and returns the messages plus the reply's id. */
function exchange(
  messages: readonly Message[],
  draft: string,
  reply: string,
  source = fakeSource(),
) {
  const started = startExchange(messages, draft, source);
  if (!started) throw new Error('exchange did not start');
  return {
    replyId: started.replyId,
    messages: finishReply(appendToReply(started.messages, started.replyId, reply), started.replyId),
  };
}

describe('checkDraft', () => {
  it('rejects empty and whitespace-only drafts', () => {
    expect(checkDraft('')).toEqual({ valid: false, reason: 'empty' });
    expect(checkDraft('   \n\t ')).toEqual({ valid: false, reason: 'empty' });
  });

  it('rejects drafts over the length limit and accepts one exactly at it', () => {
    expect(checkDraft('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toEqual({
      valid: false,
      reason: 'too-long',
    });
    expect(checkDraft('a'.repeat(MAX_MESSAGE_LENGTH)).valid).toBe(true);
  });

  it('trims surrounding whitespace but keeps inner new lines', () => {
    expect(checkDraft('  line one\nline two  ')).toEqual({
      valid: true,
      text: 'line one\nline two',
    });
  });
});

describe('startExchange', () => {
  it('adds the user message and an empty streaming reply at the end', () => {
    const started = startExchange([], '  Hello ', fakeSource());
    expect(started?.messages.map((m) => [m.author, m.text, m.status])).toEqual([
      ['user', 'Hello', 'done'],
      ['assistant', '', 'streaming'],
    ]);
    expect(started?.replyId).toBe('id-2');
  });

  it('refuses invalid drafts and a second send while a reply is streaming', () => {
    expect(startExchange([], '   ', fakeSource())).toBeNull();
    const started = startExchange([], 'First', fakeSource());
    if (!started) throw new Error('expected a start');
    expect(isReplying(started.messages)).toBe(true);
    expect(startExchange(started.messages, 'Second', fakeSource())).toBeNull();
  });
});

describe('reply lifecycle', () => {
  it('streams text into the reply and finishes it', () => {
    const { messages } = exchange([], 'Hi', 'Hello there');
    expect(messages.at(-1)).toMatchObject({ text: 'Hello there', status: 'done' });
    expect(isReplying(messages)).toBe(false);
  });

  it('keeps partial text and the error when a reply fails, and never touches the user message', () => {
    const started = startExchange([], 'Hi', fakeSource());
    if (!started) throw new Error('expected a start');
    const partial = appendToReply(started.messages, started.replyId, 'Hel');
    const failed = failReply(partial, started.replyId, chatError('network', 'offline').info);

    expect(failed[0]).toEqual(started.messages[0]);
    expect(failed[1]).toMatchObject({ text: 'Hel', status: 'error', error: { code: 'network' } });
  });

  it('marks a user stop as "stopped", not as an error', () => {
    const started = startExchange([], 'Hi', fakeSource());
    if (!started) throw new Error('expected a start');
    const stopped = failReply(
      appendToReply(started.messages, started.replyId, 'Partial'),
      started.replyId,
      chatError('aborted', 'stop').info,
    );
    expect(stopped[1]).toMatchObject({ text: 'Partial', status: 'stopped', error: null });
  });

  it('resets a failed reply so it can be retried', () => {
    const started = startExchange([], 'Hi', fakeSource());
    if (!started) throw new Error('expected a start');
    const failed = failReply(
      started.messages,
      started.replyId,
      chatError('rate_limit', '429').info,
    );
    expect(resetReply(failed, started.replyId)[1]).toMatchObject({
      text: '',
      status: 'streaming',
      error: null,
    });
  });

  it('does not mutate the previous list', () => {
    const { messages } = exchange([], 'Hi', 'Hello');
    const copy = structuredClone(messages);
    appendToReply(messages, messages[1]?.id ?? '', 'more');
    expect(messages).toEqual(copy);
  });
});

describe('to-do action lifecycle (B-11)', () => {
  const card: TodoCard = {
    kind: 'added',
    todo: { id: 't1', text: 'ask Ana how deploys work', done: false },
  };

  function withAction() {
    const started = startExchange([], 'Remind me to ask Ana how deploys work', fakeSource());
    if (!started) throw new Error('expected a start');
    const { replyId } = started;
    const streamed = appendToReply(started.messages, replyId, 'Sure, added!');
    const pending = startAction(streamed, replyId, { kind: 'add', text: 'ask Ana' });
    return { replyId, pending };
  }

  it('drops the model text when an action arrives, and ignores text and actions after it', () => {
    const { replyId, pending } = withAction();
    expect(pending[1]).toMatchObject({
      text: '',
      status: 'streaming',
      action: { status: 'pending', request: { kind: 'add' } },
    });
    const later = startAction(appendToReply(pending, replyId, 'Done!'), replyId, { kind: 'list' });
    expect(later[1]).toEqual(pending[1]);
  });

  it('settles the reply with the card', () => {
    const { replyId, pending } = withAction();
    expect(settleAction(pending, replyId, card)[1]).toMatchObject({
      status: 'done',
      action: { status: 'settled', card },
    });
  });

  it('drops a pending action when the reply fails or is stopped', () => {
    const { replyId, pending } = withAction();
    expect(failReply(pending, replyId, chatError('network', 'x').info)[1]).toMatchObject({
      status: 'error',
      action: null,
    });
    expect(failReply(pending, replyId, chatError('aborted', 'x').info)[1]).toMatchObject({
      status: 'stopped',
      action: null,
    });
  });

  it("sends a settled card to the model as the reply's text", () => {
    const { replyId, pending } = withAction();
    const settled = settleAction(pending, replyId, card);
    expect(historyBefore(settled, 'none')).toEqual([
      { role: 'user', content: 'Remind me to ask Ana how deploys work' },
      {
        role: 'assistant',
        content: "[The app's to-do list] Added to your list: ask Ana how deploys work",
      },
    ]);
  });
});

describe('canClear', () => {
  it('is false for an empty conversation and true once there is a message', () => {
    expect(canClear([])).toBe(false);
    expect(canClear(exchange([], 'Hi', 'Hello').messages)).toBe(true);
  });

  it('is true while a reply is streaming, since clearing stops it first', () => {
    const started = startExchange([], 'Hi', fakeSource());
    expect(canClear(started?.messages ?? [])).toBe(true);
  });
});

describe('historyBefore', () => {
  it('sends every earlier turn, so the model keeps the context over five turns', () => {
    const source = fakeSource();
    let messages: readonly Message[] = [];
    for (let turn = 1; turn <= 5; turn++) {
      messages = exchange(
        messages,
        `Question ${String(turn)}`,
        `Answer ${String(turn)}`,
        source,
      ).messages;
    }
    const sixth = startExchange(messages, 'Question 6', source);
    if (!sixth) throw new Error('expected a start');

    const history = historyBefore(sixth.messages, sixth.replyId);
    expect(history).toHaveLength(11);
    expect(history[0]).toEqual({ role: 'user', content: 'Question 1' });
    expect(history.at(-2)).toEqual({ role: 'assistant', content: 'Answer 5' });
    expect(history.at(-1)).toEqual({ role: 'user', content: 'Question 6' });
  });

  it('skips failed and empty replies but keeps stopped ones', () => {
    const source = fakeSource();
    const first = startExchange([], 'One', source);
    if (!first) throw new Error('expected a start');
    const failed = failReply(first.messages, first.replyId, chatError('network', 'x').info);
    const second = startExchange(failed, 'Two', source);
    if (!second) throw new Error('expected a start');
    const stopped = failReply(
      appendToReply(second.messages, second.replyId, 'Half'),
      second.replyId,
      chatError('aborted', 'x').info,
    );
    const third = startExchange(stopped, 'Three', source);
    if (!third) throw new Error('expected a start');

    expect(historyBefore(third.messages, third.replyId)).toEqual([
      { role: 'user', content: 'One' },
      { role: 'user', content: 'Two' },
      { role: 'assistant', content: 'Half' },
      { role: 'user', content: 'Three' },
    ]);
  });
});
