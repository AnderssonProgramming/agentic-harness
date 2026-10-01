import { isChatErrorInfo } from '../../../shared/llm/protocol';
import type { Message } from './message';

export const SNAPSHOT_VERSION = 1;

/** Migration `n` turns version-`n` data into version `n + 1`. Empty in production until a format changes. */
export type Migrations = Readonly<Record<number, (data: Record<string, unknown>) => unknown>>;

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
    (value.error === null || isChatErrorInfo(value.error))
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

/** A reply can't still be streaming after a restart: it comes back stopped, keeping its text (B-08). */
function settle(message: Message): Message {
  return message.status === 'streaming' ? { ...message, status: 'stopped' } : message;
}

/**
 * Reads a stored snapshot. `reset` means the data was unreadable, from an unknown version, or
 * failed validation, and the conversation starts empty.
 */
export function restoreSnapshot(
  raw: string | null,
  migrations: Migrations = {},
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
