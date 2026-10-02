import type { IncomingMessage, ServerResponse } from 'node:http';
import { chatError, isChatError } from '../../src/shared/llm/errors.ts';
import type { EngineInfo, StreamEvent } from '../../src/shared/llm/protocol.ts';
import { isTodoRequest } from '../../src/shared/llm/todo-phrases.ts';
import { LLM_CONFIG } from './config.ts';
import { selectEngine, type Env } from './engine.ts';
import type { Engine, TokenUsage } from './engines/types.ts';
import { IDLE_TIMEOUT } from './errors.ts';
import { parseChatRequest, parseTodoRefs, trimHistory } from './history.ts';
import { SYSTEM_PROMPT } from './system-prompt.ts';
import { MAX_PROMPT_ADDITIONS, promptAdditionsLength } from './todo-tools.ts';

interface ChatHandlerOptions {
  /** Read on every request, so tests and the verify script can change it. */
  env: () => Env;
  engineFor?: (env: Env) => Engine;
  idleTimeoutMs?: number;
}

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
 * An oversized body is rejected at once, but the rest of its upload is still on the connection:
 * reused, it would make the next request hang (P-01). So the reply closes the connection, and the
 * remaining bytes are read and discarded until Node closes the socket after the reply.
 */
function readJsonBody(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let oversized = false;
    req.on('data', (chunk: Buffer | string) => {
      if (oversized) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        oversized = true;
        chunks.length = 0;
        res.setHeader('connection', 'close');
        reject(chatError('bad_request', `Request body is larger than ${String(maxBytes)} bytes`));
        return;
      }
      chunks.push(buffer);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (oversized) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(chatError('bad_request', 'Request body is not valid JSON'));
      }
    });
  });
}

/**
 * GET → the active engine and whether it can run to-do actions (EngineInfo, ADR-11), so the
 * browser can show its notice before the first message. A bad configuration answers 503.
 */
export function createEngineInfoHandler({
  env,
  engineFor = selectEngine,
}: Pick<ChatHandlerOptions, 'env' | 'engineFor'>) {
  return function handleEngineInfo(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('allow', 'GET');
      res.end();
      return;
    }
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    try {
      const engine = engineFor(env());
      const info: EngineInfo = {
        engine: engine.name,
        model: engine.model,
        actions: engine.actions,
      };
      res.statusCode = 200;
      res.end(JSON.stringify(info));
    } catch (error) {
      const failure = isChatError(error)
        ? error
        : chatError('unknown', error instanceof Error ? error.message : String(error));
      res.statusCode = 503;
      res.end(JSON.stringify({ error: failure.info }));
    }
  };
}

/**
 * POST { messages } → NDJSON stream: start, delta..., then done or error (ADR-09).
 * Always answers 200 once streaming starts; failures travel as an error event with a code.
 */
export function createChatHandler({
  env,
  engineFor = selectEngine,
  idleTimeoutMs = LLM_CONFIG.idleTimeoutMs,
}: ChatHandlerOptions) {
  return async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('allow', 'POST');
      res.end();
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    const send = (event: StreamEvent) => {
      if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
    };

    // Cancels the provider request when the browser goes away (Stop, closed tab) or the engine stalls.
    const upstream = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) upstream.abort();
    });
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const restartIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        upstream.abort(IDLE_TIMEOUT);
      }, idleTimeoutMs);
    };

    let engineName: string | null = null;
    try {
      const body = await readJsonBody(req, res, LLM_CONFIG.maxRequestBytes);
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
      restartIdleTimer();
      let usage = NO_TOKENS;
      for await (const chunk of engine.stream({
        system: SYSTEM_PROMPT,
        messages,
        todos,
        signal: upstream.signal,
      })) {
        restartIdleTimer();
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
      clearTimeout(idleTimer);
      res.end();
    }
  };
}
