import { describe, expect, it } from 'vitest';
import { MAX_TODO_LENGTH, MAX_TODOS_SENT } from '../../../shared/llm/limits';
import { fakeStorage } from './fake-storage';
import { createTodoActions } from './todo-actions';
import { TODO_STORAGE_KEY, createTodoStore } from './todo-store';

function setup(overrides: Partial<Storage> = {}) {
  const items = new Map<string, string>();
  const storage = fakeStorage({}, items);
  let next = 0;
  const source = { newId: () => `t${String(++next)}`, now: () => 100 + next };
  // The app's view of the same storage, where the overrides can make writes fail.
  const view = fakeStorage(overrides, items);
  const actions = createTodoActions(
    createTodoStore(() => view),
    source,
  );
  const stored = () => {
    const raw = storage.getItem(TODO_STORAGE_KEY);
    return raw === null
      ? null
      : (JSON.parse(raw) as { todos: { text: string; done: boolean }[] }).todos;
  };
  return { storage, actions, stored };
}

describe('to-do actions (B-11)', () => {
  it('adds an open to-do to storage and confirms it from what was stored', () => {
    const { actions, stored } = setup();
    const card = actions.execute({ kind: 'add', text: 'ask Ana how deploys work' });
    expect(stored()).toEqual([
      expect.objectContaining({ text: 'ask Ana how deploys work', done: false }),
    ]);
    expect(card).toEqual({
      kind: 'added',
      todo: { id: 't1', text: 'ask Ana how deploys work', done: false },
    });
  });

  it('lists exactly the stored to-dos, open first, and says when the list is empty', () => {
    const { actions } = setup();
    expect(actions.execute({ kind: 'list' })).toEqual({ kind: 'listed', todos: [] });
    actions.execute({ kind: 'add', text: 'ask Ana how deploys work' });
    actions.execute({ kind: 'add', text: 'read the style guide' });
    actions.execute({ kind: 'complete', id: null, query: 'the deploy one' });
    expect(actions.execute({ kind: 'list' })).toEqual({
      kind: 'listed',
      todos: [
        { id: 't2', text: 'read the style guide', done: false },
        { id: 't1', text: 'ask Ana how deploys work', done: true },
      ],
    });
  });

  it('completes the matching to-do in storage and names it', () => {
    const { actions, stored } = setup();
    actions.execute({ kind: 'add', text: 'ask Ana how deploys work' });
    const card = actions.execute({ kind: 'complete', id: null, query: 'the deploy one' });
    expect(card).toEqual({
      kind: 'completed',
      todo: { id: 't1', text: 'ask Ana how deploys work', done: true },
    });
    expect(stored()?.[0]).toMatchObject({ done: true });
  });

  it('changes nothing and asks when no to-do or several match', () => {
    const { actions, storage } = setup();
    actions.execute({ kind: 'add', text: 'read the deploy guide' });
    actions.execute({ kind: 'add', text: 'check the deploy checklist' });
    const before = storage.getItem(TODO_STORAGE_KEY);

    expect(actions.execute({ kind: 'complete', id: null, query: 'the coffee one' })).toEqual({
      kind: 'no-match',
      query: 'the coffee one',
    });
    const ambiguous = actions.execute({ kind: 'complete', id: null, query: 'the deploy one' });
    expect(ambiguous).toMatchObject({ kind: 'ambiguous', query: 'the deploy one' });
    expect(ambiguous.kind === 'ambiguous' && ambiguous.candidates.length).toBe(2);
    expect(storage.getItem(TODO_STORAGE_KEY)).toBe(before);
  });

  it('reports a full storage as a failure and stores nothing', () => {
    const { actions, stored } = setup({
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    expect(actions.execute({ kind: 'add', text: 'x' })).toEqual({
      kind: 'failed',
      action: 'add',
      reason: 'full',
    });
    expect(stored()).toBeNull();
  });

  it('reports blocked storage as a failure for every action, and sends no to-dos', () => {
    const actions = createTodoActions(
      createTodoStore(() => {
        throw new DOMException('blocked', 'SecurityError');
      }),
    );
    for (const action of [
      { kind: 'add', text: 'x' },
      { kind: 'list' },
      { kind: 'complete', id: null, query: 'x' },
    ] as const) {
      expect(actions.execute(action)).toEqual({
        kind: 'failed',
        action: action.kind,
        reason: 'unavailable',
      });
    }
    expect(actions.openRefs()).toEqual([]);
  });

  it('never confirms a write that storage silently dropped', () => {
    const { actions, stored } = setup({ setItem: () => undefined });
    expect(actions.execute({ kind: 'add', text: 'x' })).toEqual({
      kind: 'failed',
      action: 'add',
      reason: 'not-saved',
    });
    expect(stored()).toBeNull();
  });

  it('sends only the open to-dos to the model', () => {
    const { actions } = setup();
    actions.execute({ kind: 'add', text: 'a' });
    actions.execute({ kind: 'add', text: 'b' });
    actions.execute({ kind: 'complete', id: 't1', query: '' });
    expect(actions.openRefs()).toEqual([{ id: 't2', text: 'b' }]);
  });

  it('sends at most the 50 most recently added open to-dos, and keeps all 60 stored (F-04)', () => {
    const { actions, stored } = setup();
    for (let i = 1; i <= 60; i++) actions.execute({ kind: 'add', text: `to-do ${String(i)}` });
    actions.execute({ kind: 'complete', id: 't60', query: '' });

    const refs = actions.openRefs();
    expect(refs).toHaveLength(MAX_TODOS_SENT);
    // t60 is done, so the newest 50 open ones are t10 to t59, oldest first.
    expect(refs[0]).toEqual({ id: 't10', text: 'to-do 10' });
    expect(refs.at(-1)).toEqual({ id: 't59', text: 'to-do 59' });
    expect(stored()).toHaveLength(60);
  });

  it('shortens a to-do stored before the length limit in the ref only (F-04)', () => {
    const { storage, actions } = setup();
    const long = 'x'.repeat(MAX_TODO_LENGTH + 50);
    const todo = { id: 'old', text: long, done: false, createdAt: 1, doneAt: null };
    storage.setItem(TODO_STORAGE_KEY, JSON.stringify({ version: 1, todos: [todo] }));

    const [ref] = actions.openRefs();
    expect(ref?.text).toHaveLength(MAX_TODO_LENGTH);
    expect(ref?.text.endsWith('…')).toBe(true);
    expect(storage.getItem(TODO_STORAGE_KEY)).toContain(long);
  });

  it('reports unreadable stored data once on restore, after removing it (Amendment 1)', () => {
    const { storage, actions } = setup();
    expect(actions.restore()).toEqual({ reset: false });
    storage.setItem(TODO_STORAGE_KEY, 'not json');
    expect(actions.restore()).toEqual({ reset: true });
    expect(storage.getItem(TODO_STORAGE_KEY)).toBeNull();
    expect(actions.restore()).toEqual({ reset: false });
  });

  it('runs several actions in order, each on what the previous one stored', () => {
    const { actions, stored } = setup();
    const cards = [
      actions.execute({ kind: 'add', text: 'read the guide' }),
      actions.execute({ kind: 'add', text: 'set up the VPN' }),
      actions.execute({ kind: 'complete', id: null, query: 'the VPN one' }),
    ];
    expect(cards.map((card) => card.kind)).toEqual(['added', 'added', 'completed']);
    expect(stored()).toEqual([
      expect.objectContaining({ text: 'read the guide', done: false }),
      expect.objectContaining({ text: 'set up the VPN', done: true }),
    ]);
  });
});
