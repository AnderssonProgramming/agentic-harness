import { MAX_TODO_LENGTH, MAX_TODOS_SENT } from '../../../shared/llm/limits';
import type { TodoAction, TodoRef } from '../../../shared/llm/protocol';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  doneAt: number | null;
}

/** What a card keeps of a to-do: a copy of the stored item at the moment of the action. */
export interface TodoView {
  id: string;
  text: string;
  done: boolean;
}

export type TodoFailure = 'unavailable' | 'full' | 'not-saved';

/** The app's confirmation of an action, built only from stored data (ADR-11). */
export type TodoCard =
  | { kind: 'added'; todo: TodoView }
  | { kind: 'listed'; todos: TodoView[] }
  | { kind: 'completed'; todo: TodoView }
  | { kind: 'no-match'; query: string }
  | { kind: 'ambiguous'; query: string; candidates: TodoView[] }
  | { kind: 'failed'; action: TodoAction['kind']; reason: TodoFailure }
  /** The engine can't run to-do actions, so the request was refused and nothing was touched. */
  | { kind: 'unsupported'; action: TodoAction['kind'] };

/** The action part of a reply: requested and waiting for the stream to end, or run. */
export type TodoActionState =
  { status: 'pending'; request: TodoAction } | { status: 'settled'; card: TodoCard };

export interface TodoSource {
  newId: () => string;
  now: () => number;
}

/** The app's refusal of a to-do request the active engine can't run (ADR-11, Amendment 1). */
export function unsupportedCard(action: TodoAction): TodoCard {
  return { kind: 'unsupported', action: action.kind };
}

export function toView({ id, text, done }: Todo): TodoView {
  return { id, text, done };
}

/**
 * The open to-dos sent with a request: the most recently added ones, at most MAX_TODOS_SENT, in
 * the order they were added, so a request never breaks the server's limits (F-04). A text
 * stored before the length limit existed is shortened in the ref only; storage keeps it whole.
 */
export function openRefs(todos: readonly Todo[]): TodoRef[] {
  return todos
    .filter((todo) => !todo.done)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_TODOS_SENT)
    .map(({ id, text }) => ({
      id,
      text: text.length > MAX_TODO_LENGTH ? `${text.slice(0, MAX_TODO_LENGTH - 1)}…` : text,
    }));
}

export function addTodo(
  todos: readonly Todo[],
  text: string,
  source: TodoSource,
): { todos: Todo[]; added: Todo } {
  const added: Todo = {
    id: source.newId(),
    text: text.trim(),
    done: false,
    createdAt: source.now(),
    doneAt: null,
  };
  return { todos: [...todos, added], added };
}

export function completeTodo(todos: readonly Todo[], id: string, now: number): Todo[] {
  return todos.map((todo) => (todo.id === id ? { ...todo, done: true, doneAt: now } : todo));
}

/** Open first, then done; each group in the order the to-dos were added. */
export function listOrder(todos: readonly Todo[]): TodoView[] {
  return [...todos.filter((t) => !t.done), ...todos.filter((t) => t.done)].map(toView);
}

// Words that say how the user refers to a to-do, not which one it is.
const FILLER = new Set([
  'a',
  'an',
  'the',
  'one',
  'ones',
  'my',
  'that',
  'this',
  'to',
  'do',
  'todo',
  'item',
  'task',
  'about',
  'with',
  'for',
  'of',
]);

function keywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '' && !FILLER.has(word));
}

/**
 * The open to-dos an action refers to: the one with the model's id if it's open, else the one
 * whose text is the query, else every one containing all the query's keywords (B-11).
 */
export function matchOpenTodos(
  todos: readonly Todo[],
  target: { id: string | null; query: string },
): Todo[] {
  const open = todos.filter((todo) => !todo.done);
  const byId = open.find((todo) => todo.id === target.id);
  if (byId) return [byId];
  const query = target.query.trim().toLowerCase();
  const exact = open.filter((todo) => todo.text.toLowerCase() === query);
  if (query !== '' && exact.length > 0) return exact;
  const words = keywords(query);
  if (words.length === 0) return [];
  return open.filter((todo) => {
    const text = todo.text.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

const FAILURE_TEXT: Record<TodoFailure, string> = {
  unavailable: 'your browser is blocking storage',
  full: "your browser's storage is full",
  'not-saved': "the change didn't reach storage",
};

const quoted = (query: string) => (query === '' ? 'that' : `“${query}”`);

/** The card's headline, also used for the reply in the model's history. */
export function cardTitle(card: TodoCard): string {
  switch (card.kind) {
    case 'added':
      return `Added to your list: ${card.todo.text}`;
    case 'completed':
      return `Marked as done: ${card.todo.text}`;
    case 'listed': {
      if (card.todos.length === 0) return 'Your list is empty.';
      const open = card.todos.filter((todo) => !todo.done).length;
      const total = card.todos.length;
      return `Your list has ${String(total)} ${total === 1 ? 'to-do' : 'to-dos'}, ${String(open)} open:`;
    }
    case 'no-match':
      return `No open to-do matches ${quoted(card.query)}. Which one do you mean?`;
    case 'ambiguous':
      return `More than one open to-do matches ${quoted(card.query)}. Which one do you mean?`;
    case 'failed':
      return card.action === 'list'
        ? `Couldn't read your list: ${FAILURE_TEXT[card.reason]}.`
        : `Couldn't save to your list: ${FAILURE_TEXT[card.reason]}. Nothing was changed.`;
    case 'unsupported':
      return `${UNSUPPORTED_TEXT[card.action]}: the current engine can't run to-do actions, so Compass didn't touch your list.`;
  }
}

const UNSUPPORTED_TEXT: Record<TodoAction['kind'], string> = {
  add: 'Not added',
  list: 'Not shown',
  complete: 'Not marked as done',
};

/** The card as one block of text, so the next turn's model knows what the app did. */
export function cardSummary(card: TodoCard): string {
  const items =
    card.kind === 'listed' ? card.todos : card.kind === 'ambiguous' ? card.candidates : [];
  const lines = items.map((todo) => `- ${todo.text}${todo.done ? ' (done)' : ''}`);
  return [`[The app's to-do list] ${cardTitle(card)}`, ...lines].join('\n');
}
