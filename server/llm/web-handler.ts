import { chatError } from '../../src/shared/llm/errors.ts';
import type { StreamEvent } from '../../src/shared/llm/protocol.ts';
import { engineInfo, NDJSON_CONTENT_TYPE, runChat, type ChatCoreOptions } from './chat-core.ts';
import { LLM_CONFIG } from './config.ts';

/**
 * Reads at most maxBytes of the body, then parses it as JSON. Stops reading as soon as the limit
 * is passed, so an oversized upload costs no more memory than the limit.
 */
async function readJsonRequest(request: Request, maxBytes: number): Promise<unknown> {
  const tooLarge = () =>
    chatError('bad_request', `Request body is larger than ${String(maxBytes)} bytes`);
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader: ReadableStreamDefaultReader<Uint8Array> = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw chatError('bad_request', 'Request body is not valid JSON');
  }
}

function chatResponse(request: Request, options: ChatCoreOptions): Response {
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const encoder = new TextEncoder();
  // The stream's cancel() is the one signal every runtime gives when the client goes away.
  const clientGone = new AbortController();
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: StreamEvent) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      void runChat(options, {
        readBody: () => readJsonRequest(request, LLM_CONFIG.maxRequestBytes),
        send,
        clientGone: clientGone.signal,
      }).finally(() => {
        if (closed) return;
        closed = true;
        controller.close();
      });
    },
    cancel() {
      closed = true;
      clientGone.abort();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': NDJSON_CONTENT_TYPE, 'cache-control': 'no-store' },
  });
}

function engineResponse(request: Request, options: ChatCoreOptions): Response {
  if (request.method !== 'GET')
    return new Response(null, { status: 405, headers: { allow: 'GET' } });
  const result = engineInfo(options);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * The Web `Request` → `Response` adapter over the chat core (ADR-13), for runtimes like Netlify
 * Functions: `/api/chat` streams NDJSON, `/api/engine` answers EngineInfo, anything else is 404.
 */
export function createWebApiHandler(options: ChatCoreOptions) {
  return function handleApi(request: Request): Response {
    const { pathname } = new URL(request.url);
    if (pathname === LLM_CONFIG.route) return chatResponse(request, options);
    if (pathname === LLM_CONFIG.engineRoute) return engineResponse(request, options);
    return new Response(null, { status: 404 });
  };
}
