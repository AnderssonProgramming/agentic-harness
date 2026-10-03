import type { IncomingMessage, ServerResponse } from 'node:http';
import { chatError } from '../../src/shared/llm/errors.ts';
import type { StreamEvent } from '../../src/shared/llm/protocol.ts';
import { engineInfo, NDJSON_CONTENT_TYPE, runChat, type ChatCoreOptions } from './chat-core.ts';
import { LLM_CONFIG } from './config.ts';

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

/** GET → EngineInfo, or 503 with the error for a bad configuration (Node adapter, ADR-13). */
export function createEngineInfoHandler(options: Pick<ChatCoreOptions, 'env' | 'engineFor'>) {
  return function handleEngineInfo(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('allow', 'GET');
      res.end();
      return;
    }
    const result = engineInfo(options);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.statusCode = result.status;
    res.end(JSON.stringify(result.body));
  };
}

/**
 * POST { messages } → NDJSON stream (Node adapter over runChat, ADR-13). Always answers 200 once
 * streaming starts; failures travel as an error event with a code (ADR-09).
 */
export function createChatHandler(options: ChatCoreOptions) {
  return async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('allow', 'POST');
      res.end();
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', NDJSON_CONTENT_TYPE);
    res.setHeader('cache-control', 'no-store');
    const clientGone = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) clientGone.abort();
    });
    try {
      await runChat(options, {
        readBody: () => readJsonBody(req, res, LLM_CONFIG.maxRequestBytes),
        send: (event: StreamEvent) => {
          if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
        },
        clientGone: clientGone.signal,
      });
    } finally {
      res.end();
    }
  };
}
