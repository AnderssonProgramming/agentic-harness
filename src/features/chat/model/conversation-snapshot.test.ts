import { describe, expect, it } from 'vitest';
import { chatError } from '../../../shared/llm/errors';
import {
  CONVERSATION_MIGRATIONS,
  restoreSnapshot,
  toSnapshot,
  type Migrations,
} from './conversation-snapshot';
import type { Message } from './message';

function message(overrides: Partial<Message>): Message {
  return {
    id: 'id-1',
    author: 'user',
    text: 'Hi',
    createdAt: 1_000,
    status: 'done',
    error: null,
    actions: [],
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
    ['a future version', '{"version":5,"messages":[]}'],
    [
      'a to-do card that is not valid',
      JSON.stringify({
        version: 3,
        messages: [{ ...message({}), actions: [{ status: 'settled', card: { kind: 'added' } }] }],
      }),
    ],
    [
      'a version-2 to-do card that is not valid',
      JSON.stringify({
        version: 2,
        messages: [
          {
            ...message({}),
            actions: undefined,
            action: { status: 'settled', card: { kind: 'x' } },
          },
        ],
      }),
    ],
    ['actions that are not a list', toSnapshot([{ ...message({}), actions: null } as never])],
    ['a version that is not a number', '{"version":"1","messages":[]}'],
  ])('starts empty and reports a reset for %s', (_case, raw) => {
    expect(restoreSnapshot(raw)).toEqual({ messages: [], outcome: 'reset' });
  });

  const card = {
    status: 'settled' as const,
    card: {
      kind: 'added' as const,
      todo: { id: 't1', text: 'ask Ana how deploys work', done: false },
    },
  };

  /** How version 2 stored a message: `action`, a single state or null, instead of `actions`. */
  const asVersion2 = ({ actions, ...rest }: Message) => ({ ...rest, action: actions[0] ?? null });

  it('migrates version 1 (B-08) through version 2 to 3: every message gets no actions (B-11)', () => {
    // Version 1 serialized the same fields, minus the to-do actions.
    const raw = JSON.stringify({ version: 1, messages: conversation }, (key, value: unknown) =>
      key === 'actions' ? undefined : value,
    );
    expect(raw).not.toContain('"action');
    expect(restoreSnapshot(raw)).toEqual({ messages: conversation, outcome: 'restored' });
  });

  it('migrates version 2 to 3: a stored action becomes a one-card list (Amendment 1)', () => {
    const withCard = [
      message({ id: 'id-1', text: 'Remind me to ask Ana how deploys work' }),
      message({ id: 'id-2', author: 'assistant', text: '', actions: [card] }),
      message({ id: 'id-3', text: 'Hi' }),
      message({ id: 'id-4', author: 'assistant', text: 'Hello' }),
    ];
    const raw = JSON.stringify({ version: 2, messages: withCard.map(asVersion2) });
    expect(raw).toContain(`"action":${JSON.stringify(card)}`);
    expect(restoreSnapshot(raw)).toEqual({ messages: withCard, outcome: 'restored' });
  });

  it('migrates version 3 to 4 unchanged, and round-trips a too-long failure card (F-02)', () => {
    const withCard = [
      message({ id: 'id-1', text: 'Remind me to ask Ana how deploys work' }),
      message({ id: 'id-2', author: 'assistant', text: '', actions: [card] }),
    ];
    const v3 = JSON.stringify({ version: 3, messages: withCard });
    expect(restoreSnapshot(v3)).toEqual({ messages: withCard, outcome: 'restored' });

    const tooLong = {
      status: 'settled' as const,
      card: { kind: 'failed' as const, action: 'add' as const, reason: 'too-long' as const },
    };
    const withFailure = [
      message({ id: 'id-3', author: 'assistant', text: '', actions: [tooLong] }),
    ];
    expect(restoreSnapshot(toSnapshot(withFailure))).toEqual({
      messages: withFailure,
      outcome: 'restored',
    });
  });

  it('round-trips several settled cards and drops pending ones after a restart (B-11)', () => {
    const refused = {
      status: 'settled' as const,
      card: { kind: 'unsupported' as const, action: 'add' as const },
    };
    const raw = toSnapshot([
      message({ id: 'id-1' }),
      message({ id: 'id-2', author: 'assistant', text: '', actions: [card, refused] }),
      message({ id: 'id-3' }),
      message({
        id: 'id-4',
        author: 'assistant',
        text: '',
        status: 'streaming',
        actions: [
          { status: 'pending', request: { kind: 'list' } },
          { status: 'pending', request: { kind: 'add', text: 'x' } },
        ],
      }),
    ]);
    const { messages } = restoreSnapshot(raw);
    expect(JSON.parse(raw)).toMatchObject({ version: 4 });
    expect(messages[1]?.actions).toEqual([card, refused]);
    expect(messages[3]).toMatchObject({ status: 'stopped', actions: [] });
  });

  it('migrates a known older version', () => {
    const migrations: Migrations = {
      ...CONVERSATION_MIGRATIONS,
      0: (data) => ({ version: 1, messages: data.items }),
    };
    const raw = JSON.stringify({ version: 0, items: conversation }, (key, value: unknown) =>
      key === 'actions' ? undefined : value,
    );
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
