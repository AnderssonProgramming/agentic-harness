import { isTodoAction } from '../../../shared/llm/protocol';
import type { Todo, TodoActionState, TodoCard, TodoView } from './todo';

export const TODO_SNAPSHOT_VERSION = 1;

/** Migration `n` turns version-`n` data into version `n + 1`. Empty until the format changes. */
export type TodoMigrations = Readonly<Record<number, (data: Record<string, unknown>) => unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isTimestamp = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

function isTodo(value: unknown): value is Todo {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    typeof value.done === 'boolean' &&
    isTimestamp(value.createdAt) &&
    (value.doneAt === null || isTimestamp(value.doneAt))
  );
}

function isTodoView(value: unknown): value is TodoView {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    typeof value.done === 'boolean'
  );
}

const isViewList = (value: unknown) => Array.isArray(value) && value.every(isTodoView);
const ACTION_KINDS: readonly unknown[] = ['add', 'list', 'complete'];
const FAILURES: readonly unknown[] = ['unavailable', 'full', 'not-saved', 'too-long'];

export function isTodoCard(value: unknown): value is TodoCard {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'added':
    case 'completed':
      return isTodoView(value.todo);
    case 'listed':
      return isViewList(value.todos);
    case 'no-match':
      return typeof value.query === 'string';
    case 'ambiguous':
      return typeof value.query === 'string' && isViewList(value.candidates);
    case 'failed':
      return ACTION_KINDS.includes(value.action) && FAILURES.includes(value.reason);
    case 'unsupported':
      return ACTION_KINDS.includes(value.action);
    default:
      return false;
  }
}

/** Validates the action part of a stored reply (used by the chat's snapshot). */
export function isTodoActionState(value: unknown): value is TodoActionState {
  if (!isRecord(value)) return false;
  if (value.status === 'pending') return isTodoAction(value.request);
  return value.status === 'settled' && isTodoCard(value.card);
}

export function toTodoSnapshot(todos: readonly Todo[]): string {
  return JSON.stringify({ version: TODO_SNAPSHOT_VERSION, todos });
}

function migrate(data: Record<string, unknown>, migrations: TodoMigrations): unknown {
  let current: unknown = data;
  while (isRecord(current) && current.version !== TODO_SNAPSHOT_VERSION) {
    const { version } = current;
    if (typeof version !== 'number' || !Number.isInteger(version)) return null;
    const step = migrations[version];
    if (!step) return null;
    current = step(current);
  }
  return current;
}

/** Reads a stored list. `null` means nothing usable was stored (missing, unreadable, unknown version). */
export function restoreTodos(raw: string | null, migrations: TodoMigrations = {}): Todo[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const current = migrate(parsed, migrations);
    if (!isRecord(current) || !Array.isArray(current.todos) || !current.todos.every(isTodo)) {
      return null;
    }
    return current.todos;
  } catch {
    return null;
  }
}
