// Wire protocol between the browser and the server's chat endpoint: the request is JSON, the
// response is NDJSON, one StreamEvent per line (ADR-09).

export type ChatRole = 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
}

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

export function isStreamEvent(value: unknown): value is StreamEvent {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'start':
      return typeof value.engine === 'string' && typeof value.model === 'string';
    case 'delta':
      return typeof value.text === 'string';
    case 'done':
      return true;
    case 'error': {
      const error = value.error;
      return (
        isRecord(error) &&
        isChatErrorCode(error.code) &&
        typeof error.message === 'string' &&
        (error.engine === null || typeof error.engine === 'string') &&
        typeof error.retryable === 'boolean'
      );
    }
    default:
      return false;
  }
}
