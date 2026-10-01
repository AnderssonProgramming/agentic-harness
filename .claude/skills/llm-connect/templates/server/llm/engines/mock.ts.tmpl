import { chatError } from '../../../src/shared/llm/errors.ts';
import { isChatErrorCode } from '../../../src/shared/llm/protocol.ts';
import { IDLE_TIMEOUT } from '../errors.ts';
import type { Engine } from './types.ts';

interface MockOptions {
  /** Pause between words, in ms. */
  delayMs: number;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Deterministic engine for tests and offline demos; no model is called. It echoes the last
 * message and counts the user turns it received, which proves the history arrives.
 * Test hooks in the user's message: "[mock:<error code>]" fails with that code, "[mock:slow]"
 * streams ten times slower.
 */
export function mockEngine({ delayMs }: MockOptions): Engine {
  return {
    name: 'mock',
    model: 'echo',
    async *stream({ messages, signal }) {
      const last = messages.at(-1)?.content ?? '';
      const injected = /\[mock:([a-z_]+)\]/.exec(last)?.[1];
      if (injected && injected !== 'slow') {
        if (!isChatErrorCode(injected))
          throw chatError('bad_request', `Unknown mock error: ${injected}`, 'mock');
        throw chatError(injected, `Simulated ${injected} error`, 'mock');
      }
      const userTurns = messages.filter((turn) => turn.role === 'user').length;
      const reply = `You said: "${last.replace(/\s+/g, ' ').trim()}". This is the mock engine, so no model was called. I have received ${String(userTurns)} of your messages in this conversation.`;
      const pause = injected === 'slow' ? delayMs * 10 : delayMs;
      for (const word of reply.split(/(?<= )/)) {
        try {
          await sleep(pause, signal);
        } catch {
          throw signal.reason === IDLE_TIMEOUT
            ? chatError('timeout', 'mock timed out', 'mock')
            : chatError('aborted', 'mock request cancelled', 'mock');
        }
        yield word;
      }
    },
  };
}
