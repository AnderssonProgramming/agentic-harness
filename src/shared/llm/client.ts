import { chatError, isChatError } from './errors.ts';
import { fitHistory } from './history-budget.ts';
import { MAX_HISTORY_CHARS } from './limits.ts';
import { readLines } from './lines.ts';
import {
  isEngineInfo,
  isStreamEvent,
  type ChatTurn,
  type EngineInfo,
  type TodoAction,
  type TodoRef,
} from './protocol.ts';

const ENGINE_ENDPOINT = '/api/engine';

/**
 * Asks the server which engine is active and whether it can run to-do actions (ADR-11).
 * Never throws: `null` means unknown (server unreachable, bad configuration, odd answer).
 */
export async function fetchEngineInfo(endpoint = ENGINE_ENDPOINT): Promise<EngineInfo | null> {
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return null;
    const info: unknown = await response.json();
    return isEngineInfo(info)
      ? { engine: info.engine, model: info.model, actions: info.actions }
      : null;
  } catch {
    return null;
  }
}

export interface StreamChatOptions {
  onDelta: (text: string) => void;
  /** The model asked for a to-do action; the caller runs it (ADR-11). */
  onAction?: (action: TodoAction) => void;
  /** The user's open to-dos, sent so the model can name one. */
  todos?: readonly TodoRef[];
  onStart?: (source: EngineInfo) => void;
  /** Aborting it stops the reply; streamChat then rejects with code "aborted". */
  signal?: AbortSignal;
  /** Fails with "timeout" when no data arrives for this long. */
  idleTimeoutMs?: number;
  endpoint?: string;
}

const DEFAULT_ENDPOINT = '/api/chat';

/**
 * The chat request body. Older messages the server would drop are left out. When the newest
 * unanswered messages alone exceed the budget they are still all sent, so the server rejects the
 * request visibly instead of the browser silently cutting the user's words.
 */
export function requestBody(messages: readonly ChatTurn[], todos?: readonly TodoRef[]): string {
  const sent = messages.slice(fitHistory(messages, MAX_HISTORY_CHARS).from);
  return JSON.stringify(todos ? { messages: sent, todos } : { messages: sent });
}
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT = 'idle-timeout';

/**
 * Sends the newest messages the server can use (the same budget it applies, so a long
 * conversation never outgrows the body limit, P-01) and streams the reply through onDelta.
 * Resolves when the reply is complete; rejects with a ChatError in every failure case.
 */
export async function streamChat(
  messages: readonly ChatTurn[],
  options: StreamChatOptions,
): Promise<void> {
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const controller = new AbortController();
  const stopFromCaller = () => {
    controller.abort();
  };
  options.signal?.addEventListener('abort', stopFromCaller);
  if (options.signal?.aborted) controller.abort();

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const restartIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      controller.abort(IDLE_TIMEOUT);
    }, idleTimeoutMs);
  };

  let engine: string | null = null;
  try {
    restartIdleTimer();
    const response = await fetch(options.endpoint ?? DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestBody(messages, options.todos),
      signal: controller.signal,
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.body || !type.includes('application/x-ndjson')) {
      throw chatError('malformed', `Unexpected response: HTTP ${String(response.status)} ${type}`);
    }

    let finished = false;
    for await (const line of readLines(response.body, controller.signal)) {
      restartIdleTimer();
      if (line.trim() === '') continue;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        throw chatError('malformed', `Not JSON: ${line.slice(0, 120)}`, engine);
      }
      if (!isStreamEvent(event)) {
        throw chatError('malformed', `Unknown event: ${line.slice(0, 120)}`, engine);
      }
      if (event.type === 'start') {
        engine = event.engine;
        options.onStart?.({ engine: event.engine, model: event.model, actions: event.actions });
      } else if (event.type === 'delta') {
        options.onDelta(event.text);
      } else if (event.type === 'action') {
        options.onAction?.(event.action);
      } else if (event.type === 'error') {
        throw chatError(event.error.code, event.error.message, event.error.engine ?? engine);
      } else {
        finished = true;
        break;
      }
    }
    if (!finished)
      throw chatError('malformed', 'The stream ended before the reply was complete', engine);
  } catch (error) {
    if (isChatError(error)) throw error;
    if (options.signal?.aborted) throw chatError('aborted', 'Stopped by the user', engine);
    if (controller.signal.reason === IDLE_TIMEOUT)
      throw chatError('timeout', `No data for ${String(idleTimeoutMs)} ms`, engine);
    // fetch rejects with a TypeError when the network is down or the server is unreachable.
    throw chatError('network', error instanceof Error ? error.message : String(error), engine);
  } finally {
    clearTimeout(idleTimer);
    options.signal?.removeEventListener('abort', stopFromCaller);
  }
}
