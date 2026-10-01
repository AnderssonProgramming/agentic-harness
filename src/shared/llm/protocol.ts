// Wire protocol between the browser and the server's chat endpoint: the request is JSON, the
// response is NDJSON, one StreamEvent per line (ADR-09).

export type ChatRole = 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

/** An open to-do as the model sees it, so it can name one by id (B-11). */
export interface TodoRef {
  id: string;
  text: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
  /** The user's open to-dos. Optional: a request without it means "no to-dos". */
  todos?: TodoRef[];
}

/**
 * What the model asked the app to do with the to-do list (ADR-11). It's a request, not a
 * result: the browser runs it on stored data and builds the confirmation itself.
 */
export type TodoAction =
  | { kind: 'add'; text: string }
  | { kind: 'list' }
  | { kind: 'complete'; id: string | null; query: string };

export type ChatErrorCode =
  | 'network'
  | 'timeout'
  | 'malformed'
  | 'aborted'
  | 'engine_unreachable'
  | 'auth'
  | 'rate_limit'
  | 'quota'
  | 'overloaded'
  | 'model_not_found'
  | 'bad_request'
  | 'config'
  | 'unknown';

export interface ChatErrorInfo {
  code: ChatErrorCode;
  /** Technical detail for logs and reports; never shown to the user as is. */
  message: string;
  engine: string | null;
  retryable: boolean;
}

export type StreamEvent =
  | { type: 'start'; engine: string; model: string }
  | { type: 'delta'; text: string }
  | { type: 'action'; action: TodoAction }
  | { type: 'done' }
  | { type: 'error'; error: ChatErrorInfo };

const ERROR_CODES: readonly ChatErrorCode[] = [
  'network',
  'timeout',
  'malformed',
  'aborted',
  'engine_unreachable',
  'auth',
  'rate_limit',
  'quota',
  'overloaded',
  'model_not_found',
  'bad_request',
  'config',
  'unknown',
];

export function isChatErrorCode(value: unknown): value is ChatErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isChatErrorInfo(value: unknown): value is ChatErrorInfo {
  return (
    isRecord(value) &&
    isChatErrorCode(value.code) &&
    typeof value.message === 'string' &&
    (value.engine === null || typeof value.engine === 'string') &&
    typeof value.retryable === 'boolean'
  );
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

export function isTodoAction(value: unknown): value is TodoAction {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'add':
      return nonEmpty(value.text);
    case 'list':
      return true;
    case 'complete':
      return (
        (value.id === null || typeof value.id === 'string') &&
        typeof value.query === 'string' &&
        (nonEmpty(value.id) || nonEmpty(value.query))
      );
    default:
      return false;
  }
}

export function isTodoRef(value: unknown): value is TodoRef {
  return isRecord(value) && typeof value.id === 'string' && typeof value.text === 'string';
}

export function isStreamEvent(value: unknown): value is StreamEvent {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'start':
      return typeof value.engine === 'string' && typeof value.model === 'string';
    case 'delta':
      return typeof value.text === 'string';
    case 'action':
      return isTodoAction(value.action);
    case 'done':
      return true;
    case 'error':
      return isChatErrorInfo(value.error);
    default:
      return false;
  }
}
