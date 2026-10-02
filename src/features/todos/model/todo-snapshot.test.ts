import { describe, expect, it } from 'vitest';
import type { Todo } from './todo';
import { isTodoActionState, restoreTodos, toTodoSnapshot } from './todo-snapshot';

const todos: Todo[] = [
  { id: 't1', text: 'ask Ana how deploys work', done: false, createdAt: 1, doneAt: null },
  { id: 't2', text: 'read the style guide', done: true, createdAt: 2, doneAt: 3 },
];

describe('to-do snapshot (B-11)', () => {
  it('round-trips a list with its version', () => {
    const raw = toTodoSnapshot(todos);
    expect(JSON.parse(raw)).toMatchObject({ version: 1 });
    expect(restoreTodos(raw)).toEqual(todos);
  });

  it.each([
    ['nothing stored', null],
    ['not JSON', '{"version":1,"todos":['],
    ['an unknown version', '{"version":7,"todos":[]}'],
    ['an invalid item', '{"version":1,"todos":[{"id":"t1"}]}'],
    ['not an object', '[]'],
  ])('gives null for %s', (_, raw) => {
    expect(restoreTodos(raw)).toBeNull();
  });

  it('runs migrations up to the current version', () => {
    const v0 = JSON.stringify({ version: 0, items: todos });
    const migrations = {
      0: (data: Record<string, unknown>) => ({ version: 1, todos: data.items }),
    };
    expect(restoreTodos(v0, migrations)).toEqual(todos);
  });

  it('validates the action part of a stored reply', () => {
    const view = { id: 't1', text: 'x', done: false };
    expect(isTodoActionState({ status: 'pending', request: { kind: 'list' } })).toBe(true);
    expect(isTodoActionState({ status: 'settled', card: { kind: 'added', todo: view } })).toBe(
      true,
    );
    expect(
      isTodoActionState({
        status: 'settled',
        card: { kind: 'failed', action: 'add', reason: 'full' },
      }),
    ).toBe(true);
    expect(
      isTodoActionState({ status: 'settled', card: { kind: 'unsupported', action: 'list' } }),
    ).toBe(true);
    expect(
      isTodoActionState({ status: 'settled', card: { kind: 'unsupported', action: 'nap' } }),
    ).toBe(false);
    expect(isTodoActionState({ status: 'settled', card: { kind: 'added' } })).toBe(false);
    expect(isTodoActionState({ status: 'done', card: { kind: 'listed', todos: [] } })).toBe(false);
    expect(isTodoActionState({ status: 'pending', request: { kind: 'delete' } })).toBe(false);
  });
});
