// @vitest-environment node
import { Agent, createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatError } from '../../src/shared/llm/errors.ts';
import {
  MAX_MESSAGE_LENGTH,
  MAX_TODO_ID_LENGTH,
  MAX_TODO_LENGTH,
  MAX_TODOS_SENT,
} from '../../src/shared/llm/limits.ts';
import type { StreamEvent } from '../../src/shared/llm/protocol.ts';
import { LLM_CONFIG } from './config.ts';
import type { Env } from './engine.ts';
import { anthropicEngine } from './engines/anthropic.ts';
import { ollamaEngine } from './engines/ollama.ts';
import type { Engine, EngineStreamInput, FetchLike } from './engines/types.ts';
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

/** A POST through a given agent, so a test controls which connection it reuses. Fails instead of hanging. */
function rawPost(
  agent: Agent,
  url: string,
  body: string,
): Promise<{ headers: IncomingHttpHeaders; events: StreamEvent[] }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', agent, timeout: 3000 }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (text += chunk));
      res.on('end', () => {
        const events = text
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as StreamEvent);
        resolve({ headers: res.headers, events });
      });
    });
    req.on('timeout', () => req.destroy(new Error('no answer within 3 s: the request hung')));
    req.on('error', reject);
    req.end(body);
  });
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

  it('closes the connection after an oversized body, so later requests on the same pool are answered (P-01, ERR-02)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const engine = spyEngine();
    const url = await start({ env: () => mockEnv, engineFor: () => engine });
    const timed = (body: string) =>
      fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(3000) });
    // fetch's keep-alive pool, as the property test uses. A warm connection is the one reused.
    expect(await (await timed(JSON.stringify(hi))).text()).toContain('"done"');
    // 400 KB: big enough that the upload is still going when the server rejects it.
    const long = Array.from({ length: 100 }, () => ({ role: 'user', content: 'm'.repeat(4000) }));
    const oversized = JSON.stringify({ messages: long });
    expect(oversized.length).toBeGreaterThan(LLM_CONFIG.maxRequestBytes);
    expect(await (await timed(oversized)).text()).toContain('"bad_request"');
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await (await timed(JSON.stringify(hi))).text()).toContain('"done"');
    }
    expect(engine.calls).toHaveLength(3);

    // The rejection says it closes the connection, so no client reuses it.
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const rejected = await rawPost(agent, url, oversized);
      expect(rejected.headers.connection).toBe('close');
      expect(rejected.events.at(-1)).toMatchObject({
        type: 'error',
        error: { code: 'bad_request' },
      });
      expect((await rawPost(agent, url, JSON.stringify(hi))).events.at(-1)).toEqual({
        type: 'done',
      });
    } finally {
      agent.destroy();
    }
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

  it('rejects 60 back-to-back 4,000-character user messages that merge past the budget (F-01 bypass, IN-02)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const engine = spyEngine();
    const url = await start({ env: () => mockEnv, engineFor: () => engine });
    const messages = Array.from({ length: 60 }, () => ({
      role: 'user',
      content: 'a'.repeat(MAX_MESSAGE_LENGTH),
    }));

    expect((await post(url, { messages })).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'bad_request' },
    });
    expect(engine.calls).toHaveLength(0);
  });

  it('still sends a few unanswered 4,000-character messages, merged, within the budget (IN-02)', async () => {
    const engine = spyEngine();
    const url = await start({ env: () => mockEnv, engineFor: () => engine });
    const messages = [
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'reply' },
      ...Array.from({ length: 5 }, () => ({
        role: 'user',
        content: 'a'.repeat(MAX_MESSAGE_LENGTH),
      })),
    ];

    expect((await post(url, { messages })).at(-1)).toEqual({ type: 'done' });
    const sent = engine.calls[0]?.messages ?? [];
    expect(sent.at(-1)?.content).toHaveLength(5 * MAX_MESSAGE_LENGTH + 4 * 2);
    expect(sent.reduce((total, turn) => total + turn.content.length, 0)).toBeLessThanOrEqual(
      LLM_CONFIG.historyChars,
    );
  });

  it('rejects a to-do id over 36 characters without calling the engine (F-04 bypass, LLM-05)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const engine = spyEngine();
    const url = await start({ env: () => mockEnv, engineFor: () => engine });
    const withId = (id: string) => ({ ...hi, todos: [{ id, text: 'read the guide' }] });

    expect((await post(url, withId('x'.repeat(100_000)))).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'bad_request' },
    });
    expect((await post(url, withId('x'.repeat(MAX_TODO_ID_LENGTH + 1)))).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'bad_request' },
    });
    expect(engine.calls).toHaveLength(0);

    expect((await post(url, withId(crypto.randomUUID()))).at(-1)).toEqual({ type: 'done' });
    expect(engine.calls).toHaveLength(1);
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

  describe('token usage log (F-05)', () => {
    const question = 'How do we name feature branches here?';
    const ask = { messages: [{ role: 'user', content: question }] };
    const usageLines = (log: { mock: { calls: unknown[][] } }) =>
      log.mock.calls
        .map((args) => args.map(String).join(' '))
        .filter((line) => line.startsWith('[llm] usage'));
    const fakeFetch =
      (body: string): FetchLike =>
      () =>
        Promise.resolve(new Response(body, { status: 200 }));

    it.each([
      [
        'anthropic',
        () =>
          anthropicEngine({
            apiKey: 'sk-test-secret',
            model: 'claude-test',
            maxOutputTokens: 100,
            fetchImpl: fakeFetch(
              [
                { type: 'message_start', message: { usage: { input_tokens: 1234 } } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Use feat/' } },
                { type: 'message_delta', usage: { output_tokens: 56 } },
                { type: 'message_stop' },
              ]
                .map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`)
                .join(''),
            ),
          }),
        '[llm] usage engine=anthropic model=claude-test input=1234 output=56',
      ],
      [
        'ollama',
        () =>
          ollamaEngine({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'phi3',
            maxOutputTokens: 100,
            fetchImpl: fakeFetch(
              [
                { message: { content: 'Use feat/' } },
                { done: true, prompt_eval_count: 321, eval_count: 45 },
              ]
                .map((c) => JSON.stringify(c))
                .join('\n'),
            ),
          }),
        '[llm] usage engine=ollama model=phi3 input=321 output=45',
      ],
      ['mock', undefined, '[llm] usage engine=mock model=echo input=0 output=0'],
    ])(
      'logs exactly one line with the %s numbers, no content or key',
      async (_name, engineFor, expected) => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const url = await start({
          env: () => mockEnv,
          ...(engineFor ? { engineFor: () => engineFor() } : {}),
        });
        const events = await post(url, ask);
        expect(events.at(-1)).toEqual({ type: 'done' });
        expect(events.map((e) => e.type)).not.toContain('usage');
        expect(usageLines(log)).toEqual([expected]);
        const everything = log.mock.calls.flat().join('\n');
        expect(everything).not.toContain(question);
        expect(everything).not.toContain('Use feat/');
        expect(everything).not.toContain('sk-test-secret');
      },
    );

    it('logs zeros for a to-do request held back from an engine without actions', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const url = await start({ env: () => ({ ...mockEnv, MOCK_TOOLS: 'off' }) });
      await post(url, { messages: [{ role: 'user', content: "What's on my list?" }] });
      expect(usageLines(log)).toEqual(['[llm] usage engine=mock model=echo input=0 output=0']);
    });

    it('logs no usage line for a reply that fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const url = await start({ env: () => mockEnv });
      const events = await post(url, { messages: [{ role: 'user', content: 'x [mock:quota]' }] });
      expect(events.at(-1)).toMatchObject({ type: 'error' });
      expect(usageLines(log)).toEqual([]);
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
