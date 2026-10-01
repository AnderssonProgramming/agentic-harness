import { describe, expect, it } from 'vitest';
import type { Todo } from '../model/todo';
import { fakeStorage } from './fake-storage';
import { TODO_STORAGE_KEY, createTodoStore } from './todo-store';

const todos: Todo[] = [
  { id: 't1', text: 'ask Ana how deploys work', done: false, createdAt: 1, doneAt: null },
];

const throwing = (name: string) => () => {
  throw new DOMException('nope', name);
};

describe('to-do store (B-11)', () => {
  it('loads an empty list, then what it saved, under compass.todos', () => {
    const storage = fakeStorage();
    const store = createTodoStore(() => storage);
    expect(store.load()).toEqual({ ok: true, todos: [] });
    expect(store.save(todos)).toEqual({ ok: true });
    expect(JSON.parse(storage.getItem(TODO_STORAGE_KEY) ?? '')).toEqual({ version: 1, todos });
    expect(store.load()).toEqual({ ok: true, todos });
  });

  it('reports blocked storage as "unavailable" without throwing', () => {
    const store = createTodoStore(throwing('SecurityError'));
    expect(store.load()).toEqual({ ok: false, reason: 'unavailable' });
    expect(store.save(todos)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('reports a full storage as "full" and keeps what was stored', () => {
    const items = new Map<string, string>();
    createTodoStore(() => fakeStorage({}, items)).save(todos);
    const full = createTodoStore(() =>
      fakeStorage({ setItem: throwing('QuotaExceededError') }, items),
    );
    expect(full.save([])).toEqual({ ok: false, reason: 'full' });
    expect(full.load()).toEqual({ ok: true, todos });
  });

  it('removes unreadable data and starts with an empty list', () => {
    const storage = fakeStorage();
    storage.setItem(TODO_STORAGE_KEY, '{"version":1,"todos":[{"broken"');
    expect(createTodoStore(() => storage).load()).toEqual({ ok: true, todos: [] });
    expect(storage.getItem(TODO_STORAGE_KEY)).toBeNull();
  });
});
