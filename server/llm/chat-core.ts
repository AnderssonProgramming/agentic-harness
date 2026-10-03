import { chatError, isChatError } from '../../src/shared/llm/errors.ts';
import type { ChatErrorInfo, EngineInfo, StreamEvent } from '../../src/shared/llm/protocol.ts';
import { isTodoRequest } from '../../src/shared/llm/todo-phrases.ts';
import { LLM_CONFIG } from './config.ts';
import { selectEngine, type Env } from './engine.ts';
import type { Engine, TokenUsage } from './engines/types.ts';
import { IDLE_TIMEOUT } from './errors.ts';
import { parseChatRequest, parseTodoRefs, trimHistory } from './history.ts';
import { SYSTEM_PROMPT } from './system-prompt.ts';
import { MAX_PROMPT_ADDITIONS, promptAdditionsLength } from './todo-tools.ts';

/**
 * The chat endpoint's logic with no transport (ADR-13). The Node `(req, res)` handler (Vite's
 * dev and preview servers) and the Web `Request` handler (the Netlify Function) are thin adapters
 * over it, so both run the same validation, limits, engines and NDJSON protocol (ADR-09).
 */
export interface ChatCoreOptions {
  /** Read on every request, so tests and the verify script can change it. */
  env: () => Env;
  engineFor?: (env: Env) => Engine;
  idleTimeoutMs?: number;
  /** Overrides the per-engine wait for the first chunk (`LLM_CONFIG.firstChunkTimeoutMs`), for tests. */
  firstChunkTimeoutMs?: number;
}

/** What a transport gives the core for one chat request. */
export interface ChatExchange {
  /** Reads and parses the JSON body; rejects with a ChatError ("bad_request") when it can't. */
  readBody: () => Promise<unknown>;
  /** Writes one event to the stream; ignores it once the client is gone. */
  send: (event: StreamEvent) => void;
  /** Aborted when the client goes away (Stop, closed tab); cancels the provider request. */
  clientGone: AbortSignal;
}

export const NDJSON_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8';

const NO_TOKENS: TokenUsage = { type: 'usage', input: 0, output: 0 };

/**
 * One line per completed reply, for measuring cost (F-05). Names and counts only: never message
 * content or keys (ERR-03), and never sent to the browser (the protocol doesn't change).
 */
function logUsage(engine: Engine, usage: TokenUsage): void {
  console.log(
    `[llm] usage engine=${engine.name} model=${engine.model} input=${String(usage.input)} output=${String(usage.output)}`,
  );
}

/**
 * Streams one reply: start, delta..., then done or error (ADR-09). Never throws: every failure,
 * including an unreadable body, travels as an error event with a code.
 */
export async function runChat(
  {
    env,
    engineFor = selectEngine,
    idleTimeoutMs = LLM_CONFIG.idleTimeoutMs,
    firstChunkTimeoutMs,
  }: ChatCoreOptions,
  { readBody, send, clientGone }: ChatExchange,
): Promise<void> {
  const upstream = new AbortController();
  const stopUpstream = () => {
    upstream.abort();
  };
  if (clientGone.aborted) upstream.abort();
  clientGone.addEventListener('abort', stopUpstream);
  // One timer, two lengths: the first-chunk wait until the engine sends anything (a cold model
  // may still be loading, B-13), then the idle gap between chunks. Both abort as a timeout.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const restartTimer = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      upstream.abort(IDLE_TIMEOUT);
    }, ms);
  };

  let engineName: string | null = null;
  try {
    const body = await readBody();
    const messages = trimHistory(parseChatRequest(body), LLM_CONFIG.historyChars);
    const todos = parseTodoRefs(body);
    // The per-field limits keep this under the bound; the check keeps the invariant if they change.
    if (promptAdditionsLength(SYSTEM_PROMPT, todos) > MAX_PROMPT_ADDITIONS) {
      throw chatError(
        'bad_request',
        `The to-dos make the prompt longer than ${String(MAX_PROMPT_ADDITIONS)} characters`,
      );
    }
    const engine = engineFor(env());
    engineName = engine.name;
    send({ type: 'start', engine: engine.name, model: engine.model, actions: engine.actions });
    // An engine without tool calling would answer a to-do request as if it had done it, so the
    // request never reaches it; the browser shows the app's refusal instead (ADR-11).
    if (!engine.actions && isTodoRequest(messages.at(-1)?.content ?? '')) {
      send({ type: 'done' });
      logUsage(engine, NO_TOKENS);
      return;
    }
    restartTimer(firstChunkTimeoutMs ?? LLM_CONFIG.firstChunkTimeoutMs[engine.name]);
    let usage = NO_TOKENS;
    for await (const chunk of engine.stream({
      system: SYSTEM_PROMPT,
      messages,
      todos,
      signal: upstream.signal,
    })) {
      restartTimer(idleTimeoutMs);
      if (typeof chunk === 'string') send({ type: 'delta', text: chunk });
      else if ('type' in chunk) usage = chunk;
      else send({ type: 'action', action: chunk });
    }
    send({ type: 'done' });
    logUsage(engine, usage);
  } catch (error) {
    const failure = isChatError(error)
      ? error
      : chatError('unknown', error instanceof Error ? error.message : String(error), engineName);
    if (failure.info.code !== 'aborted')
      console.error(`[llm] ${failure.info.code}: ${failure.info.message}`);
    send({
      type: 'error',
      error: { ...failure.info, engine: failure.info.engine ?? engineName },
    });
  } finally {
    clearTimeout(timer);
    clientGone.removeEventListener('abort', stopUpstream);
  }
}

export type EngineInfoResult =
  { status: 200; body: EngineInfo } | { status: 503; body: { error: ChatErrorInfo } };

/**
 * The active engine and whether it can run to-do actions (EngineInfo, ADR-11), so the browser
 * can show its notice before the first message. A bad configuration answers 503.
 */
export function engineInfo({
  env,
  engineFor = selectEngine,
}: Pick<ChatCoreOptions, 'env' | 'engineFor'>): EngineInfoResult {
  try {
    const engine = engineFor(env());
    return {
      status: 200,
      body: { engine: engine.name, model: engine.model, actions: engine.actions },
    };
  } catch (error) {
    const failure = isChatError(error)
      ? error
      : chatError('unknown', error instanceof Error ? error.message : String(error));
    return { status: 503, body: { error: failure.info } };
  }
}
