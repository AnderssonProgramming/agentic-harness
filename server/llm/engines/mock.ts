import { chatError } from '../../../src/shared/llm/errors.ts';
import { isChatErrorCode, type TodoAction } from '../../../src/shared/llm/protocol.ts';
import { todoPhraseActions } from '../../../src/shared/llm/todo-phrases.ts';
import { IDLE_TIMEOUT } from '../errors.ts';
import type { Engine, TokenUsage } from './types.ts';

/** No model is called, so no tokens are used (F-05). */
const NO_USAGE: TokenUsage = { type: 'usage', input: 0, output: 0 };

/**
 * The mock's stand-in for tool calling (ADR-11): the same to-do actions a model would request,
 * one per to-do sentence of the message, in order. Anything else is an ordinary message.
 */
export function mockIntent(message: string): TodoAction[] {
  return todoPhraseActions(message.replace(/\s*\[mock:[a-z_]+\]/g, ''));
}

/**
 * The mock's stand-in for answering from the team's documents (B-06): the content of every
 * `<document>` in the system prompt whose file name's words all appear in the message, e.g.
 * branch-naming.md for "What is our branch naming convention?". Proves the documents arrive.
 */
function matchedDocuments(system: string, message: string): { source: string; content: string }[] {
  const asked = message.toLowerCase();
  const found: { source: string; content: string }[] = [];
  for (const [, source, content] of system.matchAll(
    /<document source="([^"]+)">\n([\s\S]*?)<\/document>/g,
  )) {
    const words = source
      .replace(/\.md$/, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (words.length > 0 && words.every((word) => asked.includes(word)))
      found.push({ source, content });
  }
  return found;
}

export function mockKnowledgeAnswer(system: string, message: string): string {
  return matchedDocuments(system, message)
    .map(({ source, content }) => `From ${source}: ${content.replace(/\s+/g, ' ').trim()}`)
    .join(' ');
}

/** A document name no knowledge/ folder has, cited for `[mock:unknown_source]` (B-07). */
export const MOCK_INVENTED_SOURCE = 'invented-guide.md';

/**
 * The mock's stand-in for citing (B-07): the `Sources:` line a model is asked to end with, naming
 * the documents it answered from. `[mock:unknown_source]` adds a name that isn't loaded, so the
 * browser's "not a known document" path can be checked. Empty when nothing is cited.
 */
export function mockSourcesLine(system: string, message: string): string {
  const sources = matchedDocuments(system, message).map(({ source }) => source);
  if (message.includes('[mock:unknown_source]')) sources.push(MOCK_INVENTED_SOURCE);
  return sources.length === 0 ? '' : `Sources: ${sources.join(', ')}`;
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
 * streams ten times slower, "[mock:unknown_source]" cites a document that isn't loaded. The to-do phrases of `mockIntent` yield actions instead of text,
 * unless `tools` is off.
 */
export function mockEngine({ delayMs, tools = true }: MockOptions): Engine {
  return {
    name: 'mock',
    model: 'echo',
    actions: tools,
    async *stream({ system, messages, signal }) {
      const last = messages.at(-1)?.content ?? '';
      // Only the newest message counts: after a failed reply, the server merges the next message
      // into the unanswered one with a blank line, and old markers must not fire again.
      const newest = last.split('\n\n').at(-1) ?? '';
      const injected = /\[mock:([a-z_]+)\]/.exec(newest)?.[1];
      if (injected && injected !== 'slow' && injected !== 'unknown_source') {
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
        yield NO_USAGE;
        return;
      }
      const userTurns = messages.filter((turn) => turn.role === 'user').length;
      const knowledge = mockKnowledgeAnswer(system, newest);
      const sources = mockSourcesLine(system, newest);
      const reply = `You said: "${last.replace(/\s+/g, ' ').trim()}". This is the mock engine, so no model was called. I have received ${String(userTurns)} of your messages in this conversation.${knowledge === '' ? '' : ` ${knowledge}`}${sources === '' ? '' : `\n${sources}`}`;
      for (const word of reply.split(/(?<= )/)) {
        await wait();
        yield word;
      }
      yield NO_USAGE;
    },
  };
}
