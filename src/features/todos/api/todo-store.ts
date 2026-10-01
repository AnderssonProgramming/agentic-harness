import type { Todo } from '../model/todo';
import { restoreTodos, toTodoSnapshot } from '../model/todo-snapshot';

export const TODO_STORAGE_KEY = 'compass.todos';

export type TodoStorageFailure = 'unavailable' | 'full';

export type TodoSaveResult = { ok: true } | { ok: false; reason: TodoStorageFailure };

export type TodoLoadResult =
  { ok: true; todos: Todo[] } | { ok: false; reason: TodoStorageFailure };

export interface TodoStore {
  load: () => TodoLoadResult;
  save: (todos: readonly Todo[]) => TodoSaveResult;
}

// Same mapping as the conversation store (ADR-10): browsers name a full storage differently.
function toFailure(error: unknown): { ok: false; reason: TodoStorageFailure } {
  const name = error instanceof DOMException ? error.name : '';
  const full = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
  return { ok: false, reason: full ? 'full' : 'unavailable' };
}

/**
 * The to-do list's only access to storage (ADR-10 pattern, ADR-11). Synchronous and never throws.
 * Unreadable data is removed and treated as an empty list.
 */
export function createTodoStore(getStorage: () => Storage): TodoStore {
  return {
    load: () => {
      try {
        const storage = getStorage();
        const raw = storage.getItem(TODO_STORAGE_KEY);
        const todos = restoreTodos(raw);
        if (todos === null && raw !== null) storage.removeItem(TODO_STORAGE_KEY);
        return { ok: true, todos: todos ?? [] };
      } catch (error) {
        return toFailure(error);
      }
    },
    save: (todos) => {
      try {
        getStorage().setItem(TODO_STORAGE_KEY, toTodoSnapshot(todos));
        return { ok: true };
      } catch (error) {
        return toFailure(error);
      }
    },
  };
}

export const todoStore = createTodoStore(() => window.localStorage);
