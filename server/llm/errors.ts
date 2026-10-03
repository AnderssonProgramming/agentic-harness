import { chatError, type ChatError } from '../../src/shared/llm/errors.ts';

/**
 * Abort reason the handler uses for its timeouts (the first-chunk wait and the idle gap, B-13),
 * so engines can tell them from a client disconnect.
 */
export const IDLE_TIMEOUT = 'llm-idle-timeout';

/** Maps an HTTP error from a provider to a ChatError. Order matters: quota errors arrive as 400 on Anthropic. */
export function errorFromStatus(engine: string, status: number, body: string): ChatError {
  const detail = `${engine} HTTP ${String(status)}: ${body.slice(0, 300)}`;
  if (status === 401 || status === 403) return chatError('auth', detail, engine);
  if (status === 402 || /credit balance|quota|billing/i.test(body))
    return chatError('quota', detail, engine);
  if (status === 429) return chatError('rate_limit', detail, engine);
  if (status === 529 || status === 503) return chatError('overloaded', detail, engine);
  if (status === 404 || /not_found_error|model .* not found/i.test(body)) {
    return chatError('model_not_found', detail, engine);
  }
  if (status === 400 || status === 413 || status === 422)
    return chatError('bad_request', detail, engine);
  return chatError('unknown', detail, engine);
}

/** Maps an Anthropic mid-stream error event ({ type, message }) to a ChatError. */
export function errorFromAnthropicType(type: string, message: string): ChatError {
  const detail = `anthropic ${type}: ${message}`;
  switch (type) {
    case 'authentication_error':
    case 'permission_error':
      return chatError('auth', detail, 'anthropic');
    case 'rate_limit_error':
      return chatError('rate_limit', detail, 'anthropic');
    case 'overloaded_error':
      return chatError('overloaded', detail, 'anthropic');
    case 'not_found_error':
      return chatError('model_not_found', detail, 'anthropic');
    case 'invalid_request_error':
      return /credit balance/i.test(message)
        ? chatError('quota', detail, 'anthropic')
        : chatError('bad_request', detail, 'anthropic');
    default:
      return chatError('unknown', detail, 'anthropic');
  }
}

/** A fetch to the provider failed before any HTTP response: timeout, disconnect, or unreachable. */
export function upstreamFailure(engine: string, error: unknown, signal: AbortSignal): ChatError {
  if (signal.aborted) {
    return signal.reason === IDLE_TIMEOUT
      ? chatError('timeout', `${engine} sent nothing for too long`, engine)
      : chatError('aborted', `${engine} request cancelled`, engine);
  }
  return chatError(
    'engine_unreachable',
    `${engine}: ${error instanceof Error ? error.message : String(error)}`,
    engine,
  );
}

export function parseJsonLine(engine: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw chatError('malformed', `${engine} sent invalid JSON: ${text.slice(0, 120)}`, engine);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
