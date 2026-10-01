import { describe, expect, it } from 'vitest';
import { chatError } from '../../../shared/llm/errors';
import { restoreSnapshot, toSnapshot, type Migrations } from './conversation-snapshot';
import type { Message } from './message';

function message(overrides: Partial<Message>): Message {
  return {
    id: 'id-1',
    author: 'user',
    text: 'Hi',
    createdAt: 1_000,
    status: 'done',
    error: null,
    ...overrides,
  };
}

const conversation: readonly Message[] = [
  message({ id: 'id-1', author: 'user', text: 'First question' }),
  message({ id: 'id-2', author: 'assistant', text: 'First answer' }),
  message({ id: 'id-3', author: 'user', text: 'Second question' }),
  message({
    id: 'id-4',
    author: 'assistant',
    text: 'Half',
    status: 'error',
    error: chatError('network', 'offline').info,
  }),
  message({ id: 'id-5', author: 'user', text: 'Third question' }),
  message({ id: 'id-6', author: 'assistant', text: 'Partial', status: 'stopped' }),
];

describe('restoreSnapshot', () => {
  it('round-trips order, author, text, status and error', () => {
    expect(restoreSnapshot(toSnapshot(conversation))).toEqual({
      messages: conversation,
      outcome: 'restored',
    });
  });

  it('brings a reply that was still streaming back as stopped, with its partial text', () => {
    const raw = toSnapshot([
      message({ id: 'id-1' }),
      message({ id: 'id-2', author: 'assistant', text: 'Half a rep', status: 'streaming' }),
    ]);
    expect(restoreSnapshot(raw).messages[1]).toMatchObject({
      text: 'Half a rep',
      status: 'stopped',
      error: null,
    });
  });

  it('reports an empty conversation when nothing was stored', () => {
    expect(restoreSnapshot(null)).toEqual({ messages: [], outcome: 'empty' });
  });

  it.each([
    ['corrupted JSON', '{"version":1,"messages":['],
    ['a value that is not an object', '"hello"'],
    ['an array', '[]'],
    ['missing messages', '{"version":1}'],
    ['messages that are not an array', '{"version":1,"messages":{}}'],
    ['a message with a bad author', toSnapshot([message({ author: 'bot' as Message['author'] })])],
    ['a message with a bad status', toSnapshot([message({ status: 'x' as Message['status'] })])],
    [
      'an error with an unknown code',
      JSON.stringify({
        version: 1,
        messages: [
          {
            ...message({ status: 'error' }),
            error: { code: 'nope', message: '', engine: null, retryable: false },
          },
        ],
      }),
    ],
    ['an unknown older version', '{"version":0,"items":[]}'],
    ['a future version', '{"version":2,"messages":[]}'],
    ['a version that is not a number', '{"version":"1","messages":[]}'],
  ])('starts empty and reports a reset for %s', (_case, raw) => {
    expect(restoreSnapshot(raw)).toEqual({ messages: [], outcome: 'reset' });
  });

  it('migrates a known older version', () => {
    const migrations: Migrations = { 0: (data) => ({ version: 1, messages: data.items }) };
    const raw = JSON.stringify({ version: 0, items: conversation });
    expect(restoreSnapshot(raw, migrations)).toEqual({
      messages: conversation,
      outcome: 'restored',
    });
  });

  it('reports a reset when a migration throws', () => {
    const migrations: Migrations = {
      0: () => {
        throw new Error('broken');
      },
    };
    expect(restoreSnapshot('{"version":0}', migrations).outcome).toBe('reset');
  });
});
