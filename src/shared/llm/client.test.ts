// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEngineInfo, streamChat } from './client.ts';
import { isChatError, type ChatError } from './errors.ts';
import type { StreamEvent } from './protocol.ts';

function ndjson(lines: (StreamEvent | string)[], { close = true } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(
          encoder.encode(`${typeof line === 'string' ? line : JSON.stringify(line)}\n`),
        );
      }
      if (close) controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } });
}

function mockFetch(response: Response | (() => Promise<Response>)) {
  const fn = vi.fn(typeof response === 'function' ? response : () => Promise.resolve(response));
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function failure(promise: Promise<void>): Promise<ChatError> {
  try {
    await promise;
  } catch (error) {
    if (isChatError(error)) return error;
    throw error;
  }
  throw new Error('Expected streamChat to reject');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const history = [{ role: 'user' as const, content: 'Hi' }];

describe('fetchEngineInfo (B-11)', () => {
  it('returns the engine and whether it can run actions', async () => {
    const fetchMock = mockFetch(
      new Response(JSON.stringify({ engine: 'ollama', model: 'phi3', actions: false, extra: 1 })),
    );
    expect(await fetchEngineInfo()).toEqual({ engine: 'ollama', model: 'phi3', actions: false });
    expect(fetchMock).toHaveBeenCalledWith('/api/engine');
  });

  it('returns null, never throws, for an error status, an odd body or no server', async () => {
    mockFetch(new Response('{"error":{}}', { status: 503 }));
    expect(await fetchEngineInfo()).toBeNull();
    mockFetch(new Response('{"engine":"x"}'));
    expect(await fetchEngineInfo()).toBeNull();
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await fetchEngineInfo()).toBeNull();
  });
});

describe('streamChat', () => {
  it('posts the whole history and streams deltas until done', async () => {
    const fetchMock = mockFetch(
      ndjson([
        { type: 'start', engine: 'mock', model: 'echo', actions: true },
        { type: 'delta', text: 'Hel' },
        { type: 'delta', text: 'lo' },
        { type: 'done' },
      ]),
    );
    const deltas: string[] = [];
    const onStart = vi.fn();

    await streamChat(history, { onDelta: (text) => deltas.push(text), onStart });

    expect(deltas.join('')).toBe('Hello');
    expect(onStart).toHaveBeenCalledWith({ engine: 'mock', model: 'echo', actions: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/chat');
    expect(JSON.parse(init.body as string)).toEqual({ messages: history });
  });

  it('sends the open to-dos and reports an action event (B-11)', async () => {
    const fetchMock = mockFetch(
      ndjson([
        { type: 'start', engine: 'mock', model: 'echo', actions: true },
        { type: 'action', action: { kind: 'complete', id: 't1', query: 'the deploy one' } },
        { type: 'done' },
      ]),
    );
    const onAction = vi.fn();
    const todos = [{ id: 't1', text: 'ask Ana how deploys work' }];

    await streamChat(history, { onDelta: vi.fn(), onAction, todos });

    expect(onAction).toHaveBeenCalledWith({ kind: 'complete', id: 't1', query: 'the deploy one' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ messages: history, todos });
  });

  it('rejects an action event with an invalid action as "malformed"', async () => {
    mockFetch(ndjson(['{"type":"action","action":{"kind":"add","text":"  "}}']));
    expect((await failure(streamChat(history, { onDelta: vi.fn() }))).info.code).toBe('malformed');
  });

  it('turns a server error event into a ChatError with its code and engine', async () => {
    mockFetch(
      ndjson([
        { type: 'start', engine: 'anthropic', model: 'm', actions: true },
        {
          type: 'error',
          error: { code: 'rate_limit', message: 'HTTP 429', engine: 'anthropic', retryable: true },
        },
      ]),
    );
    const error = await failure(streamChat(history, { onDelta: vi.fn() }));
    expect(error.info).toMatchObject({ code: 'rate_limit', engine: 'anthropic', retryable: true });
  });

  it('reports "network" when fetch itself fails (offline, server down)', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const error = await failure(streamChat(history, { onDelta: vi.fn() }));
    expect(error.info.code).toBe('network');
  });

  it('reports "malformed" when the stream ends without done', async () => {
    mockFetch(ndjson([{ type: 'delta', text: 'Hal' }]));
    expect((await failure(streamChat(history, { onDelta: vi.fn() }))).info.code).toBe('malformed');
  });

  it('reports "malformed" for lines that are not valid events', async () => {
    mockFetch(ndjson(['<html>oops</html>']));
    expect((await failure(streamChat(history, { onDelta: vi.fn() }))).info.code).toBe('malformed');
  });

  it('reports "malformed" when the response is not NDJSON', async () => {
    mockFetch(
      new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } }),
    );
    expect((await failure(streamChat(history, { onDelta: vi.fn() }))).info.code).toBe('malformed');
  });

  it('reports "aborted" when the caller stops the reply', async () => {
    const controller = new AbortController();
    mockFetch(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    const error = await failure(
      streamChat(history, { onDelta: vi.fn(), signal: controller.signal }),
    );
    expect(error.info).toMatchObject({ code: 'aborted', retryable: false });
  });

  it('reports "timeout" when no data arrives within the idle limit', async () => {
    mockFetch(
      ndjson([{ type: 'start', engine: 'mock', model: 'echo', actions: true }], { close: false }),
    );
    const error = await failure(streamChat(history, { onDelta: vi.fn(), idleTimeoutMs: 50 }));
    expect(error.info.code).toBe('timeout');
  });
});
