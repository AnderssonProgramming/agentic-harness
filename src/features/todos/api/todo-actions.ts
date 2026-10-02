import type { TodoAction, TodoRef } from '../../../shared/llm/protocol';
import {
  addTodo,
  completeTodo,
  listOrder,
  matchOpenTodos,
  openRefs,
  toView,
  type Todo,
  type TodoCard,
  type TodoSource,
} from '../model/todo';
import { todoStore, type TodoStore } from './todo-store';

export interface TodoActions {
  /**
   * Loads the stored list once when Compass opens. `reset` is true when it was unreadable and
   * has just been removed, so the chat can say so once (B-11, like B-08's conversation reset).
   */
  restore: () => { reset: boolean };
  /** The open to-dos to send to the model; empty if storage can't be read. */
  openRefs: () => TodoRef[];
  /** Runs an action on stored data and returns the card to show. Never throws. */
  execute: (action: TodoAction) => TodoCard;
}

const browserSource: TodoSource = {
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
};

/**
 * The confirmation is built from the list read back after the write, never from what was meant
 * to be written: if storage didn't keep the change, the card says it failed (ADR-11).
 */
export function createTodoActions(
  store: TodoStore = todoStore,
  source: TodoSource = browserSource,
): TodoActions {
  const commit = (
    action: TodoAction['kind'],
    next: readonly Todo[],
    id: string,
    kind: 'added' | 'completed',
  ): TodoCard => {
    const saved = store.save(next);
    if (!saved.ok) return { kind: 'failed', action, reason: saved.reason };
    const readBack = store.load();
    if (!readBack.ok) return { kind: 'failed', action, reason: readBack.reason };
    const stored = readBack.todos.find((todo) => todo.id === id);
    if (stored?.done !== (kind === 'completed')) {
      return { kind: 'failed', action, reason: 'not-saved' };
    }
    return { kind, todo: toView(stored) };
  };

  return {
    restore: () => {
      const loaded = store.load();
      return { reset: loaded.ok && loaded.reset };
    },
    openRefs: () => {
      const loaded = store.load();
      return loaded.ok ? openRefs(loaded.todos) : [];
    },
    execute: (action) => {
      const loaded = store.load();
      if (!loaded.ok) return { kind: 'failed', action: action.kind, reason: loaded.reason };
      const { todos } = loaded;
      switch (action.kind) {
        case 'list':
          return { kind: 'listed', todos: listOrder(todos) };
        case 'add': {
          const { todos: next, added } = addTodo(todos, action.text, source);
          return commit('add', next, added.id, 'added');
        }
        case 'complete': {
          const matches = matchOpenTodos(todos, action);
          const query = action.query.trim();
          const [target, ...others] = matches;
          if (!target) return { kind: 'no-match', query };
          if (others.length > 0)
            return { kind: 'ambiguous', query, candidates: matches.map(toView) };
          return commit(
            'complete',
            completeTodo(todos, target.id, source.now()),
            target.id,
            'completed',
          );
        }
      }
    },
  };
}

export const todoActions = createTodoActions();
