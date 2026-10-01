import type { ChatErrorCode, ChatErrorInfo } from './protocol.ts';

export type ChatError = Error & { info: ChatErrorInfo };

const RETRYABLE: Record<ChatErrorCode, boolean> = {
  network: true,
  timeout: true,
  malformed: true,
  aborted: false,
  engine_unreachable: true,
  auth: false,
  rate_limit: true,
  quota: false,
  overloaded: true,
  model_not_found: false,
  bad_request: false,
  config: false,
  unknown: true,
};

export function chatError(
  code: ChatErrorCode,
  message: string,
  engine: string | null = null,
): ChatError {
  return Object.assign(new Error(message), {
    name: 'ChatError',
    info: { code, message, engine, retryable: RETRYABLE[code] },
  });
}

export function isChatError(value: unknown): value is ChatError {
  return value instanceof Error && 'info' in value;
}

function engineLabel(engine: string | null): string {
  switch (engine) {
    case 'anthropic':
      return 'Claude';
    case 'ollama':
      return 'Ollama';
    case 'mock':
      return 'The mock engine';
    default:
      return 'The assistant';
  }
}

/** A sentence the user can act on. Technical details stay in `info.message`. */
export function describeChatError(info: ChatErrorInfo): string {
  const engine = engineLabel(info.engine);
  switch (info.code) {
    case 'network':
      return "Can't reach the server. Check your internet connection and try again.";
    case 'timeout':
      return 'The reply took too long and was stopped. Try again.';
    case 'malformed':
      return 'The reply arrived incomplete. Try again.';
    case 'aborted':
      return 'Stopped.';
    case 'engine_unreachable':
      return info.engine === 'ollama'
        ? "Ollama isn't running on this computer. Start it with `ollama serve` and try again."
        : `${engine} can't be reached right now. Try again in a moment.`;
    case 'auth':
      return `${engine} rejected the API key. Check the key in the server's .env file.`;
    case 'rate_limit':
      return 'Too many requests right now. Wait a few seconds and try again.';
    case 'quota':
      return 'The API credits have run out. Switch to the local engine (INFERENCE_ENGINE=ollama) or add credits.';
    case 'overloaded':
      return `${engine} is overloaded. Try again in a moment.`;
    case 'model_not_found':
      return `The model isn't available on ${engine}. Check the model name in the server's .env file.`;
    case 'bad_request':
      return 'The request was rejected. Start a new conversation if this keeps happening.';
    case 'config':
      return "The assistant isn't configured yet. Check the server's .env file.";
    case 'unknown':
      return 'Something went wrong. Try again.';
  }
}
