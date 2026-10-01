import type { IncomingMessage, ServerResponse } from 'node:http';
import { chatError, isChatError } from '../../src/shared/llm/errors.ts';
import type { StreamEvent } from '../../src/shared/llm/protocol.ts';
import { LLM_CONFIG } from './config.ts';
import { selectEngine, type Env } from './engine.ts';
import type { Engine } from './engines/types.ts';
import { IDLE_TIMEOUT } from './errors.ts';
import { parseChatRequest, trimHistory } from './history.ts';
import { SYSTEM_PROMPT } from './system-prompt.ts';

interface ChatHandlerOptions {
  /** Read on every request, so tests and the verify script can change it. */
  env: () => Env;
  engineFor?: (env: Env) => Engine;
  idleTimeoutMs?: number;
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > maxBytes)
      throw chatError('bad_request', `Request body is larger than ${String(maxBytes)} bytes`);
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw chatError('bad_request', 'Request body is not valid JSON');
  }
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
      const messages = trimHistory(
        parseChatRequest(await readJsonBody(req, LLM_CONFIG.maxRequestBytes)),
        LLM_CONFIG.historyChars,
      );
      const engine = engineFor(env());
      engineName = engine.name;
      send({ type: 'start', engine: engine.name, model: engine.model });
      restartIdleTimer();
      for await (const text of engine.stream({
        system: SYSTEM_PROMPT,
        messages,
        signal: upstream.signal,
      })) {
        restartIdleTimer();
        send({ type: 'delta', text });
      }
      send({ type: 'done' });
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
