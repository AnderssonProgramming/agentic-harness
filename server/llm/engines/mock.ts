import { chatError } from '../../../src/shared/llm/errors.ts';
import { isChatErrorCode, type TodoAction } from '../../../src/shared/llm/protocol.ts';
import { todoPhraseActions } from '../../../src/shared/llm/todo-phrases.ts';
import { IDLE_TIMEOUT } from '../errors.ts';
import type { Engine } from './types.ts';

/**
 * The mock's stand-in for tool calling (ADR-11): the same to-do actions a model would request,
 * one per to-do sentence of the message, in order. Anything else is an ordinary message.
 */
export function mockIntent(message: string): TodoAction[] {
  return todoPhraseActions(message.replace(/\s*\[mock:[a-z_]+\]/g, ''));
}

interface MockOptions {
  /** Pause between words, in ms. */
  delayMs: number;
  /** False behaves like an engine without tool calling (MOCK_TOOLS=off): it never yields actions. */
  tools?: boolean;
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
 * streams ten times slower. The to-do phrases of `mockIntent` yield actions instead of text,
 * unless `tools` is off.
 */
export function mockEngine({ delayMs, tools = true }: MockOptions): Engine {
  return {
    name: 'mock',
    model: 'echo',
    actions: tools,
    async *stream({ messages, signal }) {
      const last = messages.at(-1)?.content ?? '';
      // Only the newest message counts: after a failed reply, the server merges the next message
      // into the unanswered one with a blank line, and old markers must not fire again.
      const newest = last.split('\n\n').at(-1) ?? '';
      const injected = /\[mock:([a-z_]+)\]/.exec(newest)?.[1];
      if (injected && injected !== 'slow') {
        if (!isChatErrorCode(injected))
          throw chatError('bad_request', `Unknown mock error: ${injected}`, 'mock');
        throw chatError(injected, `Simulated ${injected} error`, 'mock');
      }
      const pause = injected === 'slow' ? delayMs * 10 : delayMs;
      const wait = async () => {
        try {
          await sleep(pause, signal);
        } catch {
          throw signal.reason === IDLE_TIMEOUT
            ? chatError('timeout', 'mock timed out', 'mock')
            : chatError('aborted', 'mock request cancelled', 'mock');
        }
      };
      const actions = tools ? mockIntent(newest) : [];
      if (actions.length > 0) {
        for (const action of actions) yield action;
        // Like a model finishing its turn after a tool call, so the pending card is observable.
        await wait();
        return;
      }
      const userTurns = messages.filter((turn) => turn.role === 'user').length;
      const reply = `You said: "${last.replace(/\s+/g, ' ').trim()}". This is the mock engine, so no model was called. I have received ${String(userTurns)} of your messages in this conversation.`;
      for (const word of reply.split(/(?<= )/)) {
        await wait();
        yield word;
      }
    },
  };
}
