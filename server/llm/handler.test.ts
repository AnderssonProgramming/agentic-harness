// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatError } from '../../src/shared/llm/errors.ts';
import type { StreamEvent } from '../../src/shared/llm/protocol.ts';
import type { Env } from './engine.ts';
import type { Engine } from './engines/types.ts';
import { createChatHandler } from './handler.ts';

let server: Server | undefined;

async function start(options: Parameters<typeof createChatHandler>[0]): Promise<string> {
  const handle = createChatHandler(options);
  const created = createServer((req, res) => {
    void handle(req, res);
  });
  server = created;
  await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${String((created.address() as AddressInfo).port)}`;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

async function post(url: string, body: unknown): Promise<StreamEvent[]> {
  const response = await fetch(url, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  expect(response.headers.get('content-type')).toContain('application/x-ndjson');
  const text = await response.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StreamEvent);
}

const mockEnv: Env = { INFERENCE_ENGINE: 'mock', MOCK_DELAY_MS: '0' };
const hi = { messages: [{ role: 'user', content: 'Hi' }] };

describe('chat handler', () => {
  it('streams start, deltas and done from the configured engine', async () => {
    const url = await start({ env: () => mockEnv });
    const events = await post(url, hi);
    expect(events[0]).toEqual({ type: 'start', engine: 'mock', model: 'echo' });
    expect(events.filter((e) => e.type === 'delta').length).toBeGreaterThan(3);
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('sends the history to the engine', async () => {
    const url = await start({ env: () => mockEnv });
    const events = await post(url, {
      messages: [
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'two' },
      ],
    });
    const reply = events.map((e) => (e.type === 'delta' ? e.text : '')).join('');
    expect(reply).toContain('received 2 of your messages');
  });

  it('answers malformed requests with a bad_request error event', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const url = await start({ env: () => mockEnv });
    expect((await post(url, 'not json')).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'bad_request' },
    });
  });

  it('rejects methods other than POST', async () => {
    const url = await start({ env: () => mockEnv });
    const response = await fetch(url);
    expect(response.status).toBe(405);
  });

  it('reports configuration problems as a config error instead of crashing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const url = await start({
      env: () => ({ INFERENCE_ENGINE: 'anthropic', ANTHROPIC_API_KEY: '' }),
    });
    expect((await post(url, hi)).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'config', engine: 'anthropic', retryable: false },
    });
  });

  it('turns a stalled engine into a timeout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stalled: Engine = {
      name: 'mock',
      model: 'stalled',
      async *stream({ signal }) {
        await new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(chatError('timeout', 'stalled', 'mock'));
          });
        });
        yield '';
      },
    };
    const url = await start({ env: () => mockEnv, engineFor: () => stalled, idleTimeoutMs: 50 });
    expect((await post(url, hi)).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'timeout' },
    });
  });

  it('cancels the engine when the browser disconnects', async () => {
    let cancelled = false;
    const slow: Engine = {
      name: 'mock',
      model: 'slow',
      async *stream({ signal }) {
        yield 'first ';
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            cancelled = true;
            resolve();
          });
        });
      },
    };
    const url = await start({ env: () => mockEnv, engineFor: () => slow });
    const controller = new AbortController();
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(hi),
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    await reader?.read();
    controller.abort();
    await vi.waitFor(() => {
      expect(cancelled).toBe(true);
    });
  });
});
