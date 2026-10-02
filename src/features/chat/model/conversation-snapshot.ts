import { isChatErrorInfo } from '../../../shared/llm/protocol';
import { isTodoActionState } from '../../todos';
import type { Message } from './message';

/**
 * Version 2 (B-11) added `action` to every message. Version 3 (B-11, Amendment 1) made it
 * `actions`, a list, and added the `unsupported` card.
 */
export const SNAPSHOT_VERSION = 3;

/** Migration `n` turns version-`n` data into version `n + 1`. */
export type Migrations = Readonly<Record<number, (data: Record<string, unknown>) => unknown>>;

function mapMessages(
  data: Record<string, unknown>,
  version: number,
  change: (message: Record<string, unknown>) => Record<string, unknown>,
) {
  return {
    ...data,
    version,
    messages: Array.isArray(data.messages)
      ? data.messages.map((message: unknown) => (isRecord(message) ? change(message) : message))
      : data.messages,
  };
}

/** The production migrations: every stored format since B-08 reaches the current one. */
export const CONVERSATION_MIGRATIONS: Migrations = {
  // Version 1 had no to-do actions: every message gets `action: null`.
  1: (data) => mapMessages(data, 2, (message) => ({ ...message, action: null })),
  // Version 2 had at most one action per message: `action` becomes the list `actions`.
  2: (data) =>
    mapMessages(data, 3, ({ action, ...message }) => ({
      ...message,
      actions: action === null || action === undefined ? [] : [action],
    })),
};

export type RestoreOutcome = 'restored' | 'empty' | 'reset';

export interface RestoredConversation {
  messages: readonly Message[];
  outcome: RestoreOutcome;
}

const AUTHORS: readonly unknown[] = ['user', 'assistant'];
const STATUSES: readonly unknown[] = ['streaming', 'done', 'error', 'stopped'];

export function toSnapshot(messages: readonly Message[]): string {
  return JSON.stringify({ version: SNAPSHOT_VERSION, messages });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    AUTHORS.includes(value.author) &&
    typeof value.text === 'string' &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    STATUSES.includes(value.status) &&
    (value.error === null || isChatErrorInfo(value.error)) &&
    Array.isArray(value.actions) &&
    value.actions.every(isTodoActionState)
  );
}

function migrate(data: Record<string, unknown>, migrations: Migrations): unknown {
  let current: unknown = data;
  while (isRecord(current) && current.version !== SNAPSHOT_VERSION) {
    const { version } = current;
    if (typeof version !== 'number' || !Number.isInteger(version) || version > SNAPSHOT_VERSION) {
      return null;
    }
    const step = migrations[version];
    if (!step) return null;
    current = step(current);
  }
  return current;
}

/**
 * A reply can't still be streaming after a restart: it comes back stopped, keeping its text (B-08).
 * To-do actions still pending never ran, so they're dropped (B-11).
 */
function settle(message: Message): Message {
  return message.status === 'streaming'
    ? {
        ...message,
        status: 'stopped',
        actions: message.actions.filter((action) => action.status !== 'pending'),
      }
    : message;
}

/**
 * Reads a stored snapshot. `reset` means the data was unreadable, from an unknown version, or
 * failed validation, and the conversation starts empty.
 */
export function restoreSnapshot(
  raw: string | null,
  migrations: Migrations = CONVERSATION_MIGRATIONS,
): RestoredConversation {
  if (raw === null) return { messages: [], outcome: 'empty' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { messages: [], outcome: 'reset' };
    const current = migrate(parsed, migrations);
    if (
      !isRecord(current) ||
      current.version !== SNAPSHOT_VERSION ||
      !Array.isArray(current.messages) ||
      !current.messages.every(isMessage)
    ) {
      return { messages: [], outcome: 'reset' };
    }
    return { messages: current.messages.map(settle), outcome: 'restored' };
  } catch {
    return { messages: [], outcome: 'reset' };
  }
}
