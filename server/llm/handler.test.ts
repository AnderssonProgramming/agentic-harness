// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatError } from '../../src/shared/llm/errors.ts';
import {
  MAX_MESSAGE_LENGTH,
  MAX_TODO_LENGTH,
  MAX_TODOS_SENT,
} from '../../src/shared/llm/limits.ts';
import type { StreamEvent } from '../../src/shared/llm/protocol.ts';
import type { Env } from './engine.ts';
import type { Engine, EngineStreamInput } from './engines/types.ts';
import { createChatHandler, createEngineInfoHandler } from './handler.ts';

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

/** An engine that records every call it gets and answers "ok". */
function spyEngine(): Engine & { calls: EngineStreamInput[] } {
  const calls: EngineStreamInput[] = [];
  return {
    name: 'mock',
    model: 'spy',
    actions: true,
    calls,
    async *stream(input) {
      calls.push(input);
      await Promise.resolve();
      yield 'ok';
    },
  };
}

const mockEnv: Env = { INFERENCE_ENGINE: 'mock', MOCK_DELAY_MS: '0' };
const hi = { messages: [{ role: 'user', content: 'Hi' }] };

describe('chat handler', () => {
  it('streams start, deltas and done from the configured engine', async () => {
    const url = await start({ env: () => mockEnv });
    const events = await post(url, hi);
    expect(events[0]).toEqual({ type: 'start', engine: 'mock', model: 'echo', actions: true });
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

  it('forwards a to-do action as an action event, with no text (B-11)', async () => {
    const url = await start({ env: () => mockEnv });
    const events = await post(url, {
      messages: [{ role: 'user', content: 'Mark the deploy one as done' }],
      todos: [{ id: 't1', text: 'ask Ana how deploys work' }],
    });
    expect(events.map((e) => e.type)).toEqual(['start', 'action', 'done']);
    expect(events[1]).toEqual({
      type: 'action',
      action: { kind: 'complete', id: null, query: 'the deploy one' },
    });
  });

  it('passes the open to-dos to the engine, and rejects invalid ones (B-11)', async () => {
    const seen: unknown[] = [];
    const engine: Engine = {
      name: 'mock',
      model: 'spy',
      actions: true,
      async *stream({ todos }) {
        seen.push(todos);
        await Promise.resolve();
        yield 'ok';
      },
    };
    const url = await start({ env: () => mockEnv, engineFor: () => engine });
    const todos = [{ id: 't1', text: 'read the style guide' }];
    await post(url, { ...hi, todos });
    expect(seen).toEqual([todos]);

    const events = await post(url, { ...hi, todos: [{ id: 1 }] });
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'bad_request' } });
  });

  it('never sends a to-do phrase to an engine without actions, and says so in start (B-11)', async () => {
    let called = false;
    const plain: Engine = {
      name: 'ollama',
      model: 'phi3',
      actions: false,
      async *stream() {
        called = true;
        await Promise.resolve();
        yield 'Okay, I have set a reminder for you.';
      },
    };
    const url = await start({ env: () => mockEnv, engineFor: () => plain });
    const refused = await post(url, {
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'Remind me to ask Ana how deploys work.' },
      ],
    });
    expect(refused).toEqual([
      { type: 'start', engine: 'ollama', model: 'phi3', actions: false },
      { type: 'done' },
    ]);
    expect(called).toBe(false);

    const ordinary = await post(url, { messages: [{ role: 'user', content: 'How do I deploy?' }] });
    expect(ordinary.map((e) => e.type)).toEqual(['start', 'delta', 'done']);
    expect(called).toBe(true);
  });

  it('refuses a to-do phrase on the mock with MOCK_TOOLS=off (B-11)', async () => {
    const url = await start({ env: () => ({ ...mockEnv, MOCK_TOOLS: 'off' }) });
    const events = await post(url, { messages: [{ role: 'user', content: "What's on my list?" }] });
    expect(events).toEqual([
      { type: 'start', engine: 'mock', model: 'echo', actions: false },
      { type: 'done' },
    ]);
  });

  it('answers malformed requests with a bad_request error event', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const url = await start({ env: () => mockEnv });
    expect((await post(url, 'not json')).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'bad_request' },
    });
  });

  it('rejects a user message over 4,000 characters without calling the engine (F-01)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const engine = spyEngine();
    const url = await start({ env: () => mockEnv, engineFor: () => engine });
    const ask = (content: string) => post(url, { messages: [{ role: 'user', content }] });

    expect((await ask('a'.repeat(MAX_MESSAGE_LENGTH + 1))).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'bad_request' },
    });
    expect(engine.calls).toHaveLength(0);

    expect((await ask('a'.repeat(MAX_MESSAGE_LENGTH))).at(-1)).toEqual({ type: 'done' });
    expect(engine.calls).toHaveLength(1);
  });

  it('rejects an over-long earlier user message too (F-01)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const engine = spyEngine();
    const url = await start({ env: () => mockEnv, engineFor: () => engine });
    const events = await post(url, {
      messages: [
        { role: 'user', content: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'Hi' },
      ],
    });
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'bad_request' } });
    expect(engine.calls).toHaveLength(0);
  });

  it('accepts 50 to-do refs and rejects 51 without calling the engine (F-04)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const engine = spyEngine();
    const url = await start({ env: () => mockEnv, engineFor: () => engine });
    const refs = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: `t${String(i)}`, text: 'read the guide' }));

    expect((await post(url, { ...hi, todos: refs(MAX_TODOS_SENT + 1) })).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'bad_request' },
    });
    expect(engine.calls).toHaveLength(0);

    expect((await post(url, { ...hi, todos: refs(MAX_TODOS_SENT) })).at(-1)).toEqual({
      type: 'done',
    });
    expect(engine.calls.map((call) => call.todos.length)).toEqual([MAX_TODOS_SENT]);
  });

  it('accepts a 200-character to-do and rejects 201 without calling the engine (F-04)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const engine = spyEngine();
    const url = await start({ env: () => mockEnv, engineFor: () => engine });
    const withText = (text: string) => ({
      ...hi,
      todos: [
        { id: 't1', text: 'short' },
        { id: 't2', text },
      ],
    });

    expect((await post(url, withText('a'.repeat(MAX_TODO_LENGTH + 1)))).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'bad_request' },
    });
    expect(engine.calls).toHaveLength(0);

    expect((await post(url, withText('a'.repeat(MAX_TODO_LENGTH)))).at(-1)).toEqual({
      type: 'done',
    });
    expect(engine.calls).toHaveLength(1);
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
      actions: true,
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
      actions: true,
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

describe('engine info handler (B-11)', () => {
  async function serve(env: Env): Promise<string> {
    const handle = createEngineInfoHandler({ env: () => env });
    const created = createServer(handle);
    server = created;
    await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${String((created.address() as AddressInfo).port)}`;
  }

  it.each([
    [mockEnv, { engine: 'mock', model: 'echo', actions: true }],
    [
      { ...mockEnv, MOCK_TOOLS: 'off' },
      { engine: 'mock', model: 'echo', actions: false },
    ],
    [{ INFERENCE_ENGINE: 'ollama' }, { engine: 'ollama', model: 'phi3', actions: false }],
    [
      { INFERENCE_ENGINE: 'anthropic', ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'm' },
      { engine: 'anthropic', model: 'm', actions: true },
    ],
  ])('reports whether the engine can run actions (%o)', async (env, info) => {
    const response = await fetch(await serve(env));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(info);
  });

  it('answers 503 with a config error for a bad configuration, and 405 for other methods', async () => {
    const url = await serve({ INFERENCE_ENGINE: 'anthropic', ANTHROPIC_API_KEY: '' });
    const response = await fetch(url);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'config' } });
    expect((await fetch(url, { method: 'POST' })).status).toBe(405);
  });
});
