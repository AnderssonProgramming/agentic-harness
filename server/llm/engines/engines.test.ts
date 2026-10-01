// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { isChatError } from '../../../src/shared/llm/errors.ts';
import type { ChatErrorCode } from '../../../src/shared/llm/protocol.ts';
import { IDLE_TIMEOUT } from '../errors.ts';
import { anthropicEngine } from './anthropic.ts';
import { mockEngine, mockIntent } from './mock.ts';
import { ollamaEngine } from './ollama.ts';
import type { Engine, EngineChunk, FetchLike } from './types.ts';

const input = (signal = new AbortController().signal) => ({
  system: 'Be brief.',
  messages: [{ role: 'user' as const, content: 'Hi' }],
  todos: [],
  signal,
});

function streamOf(text: string, { close = true } = {}) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      if (close) controller.close();
    },
  });
}

function respond(body: string, status = 200, { close = true } = {}): FetchLike {
  return vi.fn(() =>
    Promise.resolve(new Response(status === 200 ? streamOf(body, { close }) : body, { status })),
  );
}

async function collect(engine: Engine, signal?: AbortSignal): Promise<string> {
  let text = '';
  for await (const chunk of engine.stream(input(signal)))
    if (typeof chunk === 'string') text += chunk;
  return text;
}

async function all(stream: AsyncGenerator<EngineChunk>): Promise<EngineChunk[]> {
  const chunks: EngineChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

async function errorCode(promise: Promise<unknown>): Promise<ChatErrorCode> {
  try {
    await promise;
  } catch (error) {
    if (isChatError(error)) return error.info.code;
    throw error;
  }
  throw new Error('Expected the engine to fail');
}

const sse = (...events: object[]) =>
  events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('');

describe('anthropicEngine', () => {
  const options = { apiKey: 'test-key', model: 'claude-test', maxOutputTokens: 100 };

  it('sends the system prompt, history and key, and yields text deltas until message_stop', async () => {
    const fetchImpl = respond(
      sse(
        { type: 'message_start' },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } },
        { type: 'message_stop' },
      ),
    );
    expect(await collect(anthropicEngine({ ...options, fetchImpl }))).toBe('Hello');

    const [, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(init.headers).toMatchObject({ 'x-api-key': 'test-key' });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'claude-test',
      system: 'Be brief.',
      stream: true,
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });

  it.each([
    [401, '{"type":"error","error":{"type":"authentication_error"}}', 'auth'],
    [429, '{"type":"error","error":{"type":"rate_limit_error"}}', 'rate_limit'],
    [400, '{"error":{"message":"Your credit balance is too low"}}', 'quota'],
    [529, '{"type":"error","error":{"type":"overloaded_error"}}', 'overloaded'],
    [404, '{"type":"error","error":{"type":"not_found_error"}}', 'model_not_found'],
    [400, '{"error":{"message":"messages: bad"}}', 'bad_request'],
    [500, 'boom', 'unknown'],
  ] as const)('maps HTTP %i to "%s"', async (status, body, code) => {
    expect(
      await errorCode(collect(anthropicEngine({ ...options, fetchImpl: respond(body, status) }))),
    ).toBe(code);
  });

  it('maps an error event in the middle of the stream', async () => {
    const fetchImpl = respond(
      sse({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } }),
    );
    expect(await errorCode(collect(anthropicEngine({ ...options, fetchImpl })))).toBe('overloaded');
  });

  it('reports "malformed" for invalid JSON or a stream cut before message_stop', async () => {
    expect(
      await errorCode(
        collect(anthropicEngine({ ...options, fetchImpl: respond('data: {nope\n\n') })),
      ),
    ).toBe('malformed');
    const cut = respond(
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hal' } }),
    );
    expect(await errorCode(collect(anthropicEngine({ ...options, fetchImpl: cut })))).toBe(
      'malformed',
    );
  });

  it('reports "engine_unreachable" when the request never gets a response', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new TypeError('fetch failed'));
    expect(await errorCode(collect(anthropicEngine({ ...options, fetchImpl })))).toBe(
      'engine_unreachable',
    );
  });

  it('reports "timeout" when the handler aborts for inactivity', async () => {
    const controller = new AbortController();
    const fetchImpl = respond(sse({ type: 'message_start' }), 200, { close: false });
    const pending = collect(anthropicEngine({ ...options, fetchImpl }), controller.signal);
    setTimeout(() => {
      controller.abort(IDLE_TIMEOUT);
    }, 20);
    expect(await errorCode(pending)).toBe('timeout');
  });
});

describe('ollamaEngine', () => {
  const options = { baseUrl: 'http://127.0.0.1:11434/', model: 'phi3' };
  const lines = (...chunks: object[]) => chunks.map((c) => JSON.stringify(c)).join('\n');

  it('puts the system prompt first and yields message content until done', async () => {
    const fetchImpl = respond(
      lines({ message: { content: 'Hel' } }, { message: { content: 'lo' } }, { done: true }),
    );
    expect(await collect(ollamaEngine({ ...options, fetchImpl }))).toBe('Hello');
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'phi3',
      messages: [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Hi' },
      ],
    });
  });

  it('reports "model_not_found" when the model is not pulled', async () => {
    const fetchImpl = respond('{"error":"model \\"phi9\\" not found, try pulling it first"}', 404);
    expect(await errorCode(collect(ollamaEngine({ ...options, fetchImpl })))).toBe(
      'model_not_found',
    );
  });

  it('reports "engine_unreachable" when Ollama is not running', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new TypeError('ECONNREFUSED'));
    expect(await errorCode(collect(ollamaEngine({ ...options, fetchImpl })))).toBe(
      'engine_unreachable',
    );
  });
});

describe('mockEngine', () => {
  it('echoes the last message and counts the user turns it received', async () => {
    const engine = mockEngine({ delayMs: 0 });
    let text = '';
    for await (const chunk of engine.stream({
      system: '',
      messages: [
        { role: 'user', content: 'My name is Ada' },
        { role: 'assistant', content: 'Hi Ada' },
        { role: 'user', content: 'What is my name?' },
      ],
      todos: [],
      signal: new AbortController().signal,
    })) {
      if (typeof chunk === 'string') text += chunk;
    }
    expect(text).toContain('You said: "What is my name?"');
    expect(text).toContain('received 2 of your messages');
  });

  it('only honours a marker in the newest message of a merged turn', async () => {
    const engine = mockEngine({ delayMs: 0 });
    const failing = engine.stream({
      ...input(),
      messages: [{ role: 'user', content: 'Hello [mock:rate_limit]\n\nHello [mock:auth]' }],
    });
    expect(await errorCode(failing.next())).toBe('auth');

    let text = '';
    for await (const chunk of engine.stream({
      ...input(),
      messages: [{ role: 'user', content: 'Hello [mock:auth]\n\nA new question' }],
    })) {
      if (typeof chunk === 'string') text += chunk;
    }
    expect(text).toContain('A new question');
  });

  it('simulates any error code on request', async () => {
    const engine = mockEngine({ delayMs: 0 });
    const run = engine.stream({
      ...input(),
      messages: [{ role: 'user', content: 'x [mock:quota]' }],
    });
    expect(await errorCode(run.next())).toBe('quota');
  });

  it('yields only the to-do action for a to-do phrase, and nothing else (B-11)', async () => {
    const chunks = await all(
      mockEngine({ delayMs: 0 }).stream({
        ...input(),
        messages: [{ role: 'user', content: 'Remind me to ask Ana how deploys work.' }],
      }),
    );
    expect(chunks).toEqual([{ kind: 'add', text: 'ask Ana how deploys work' }]);
  });
});

describe('mockIntent (B-11)', () => {
  it.each([
    ['Remind me to ask Ana how deploys work', { kind: 'add', text: 'ask Ana how deploys work' }],
    ['remind me to read the style guide!', { kind: 'add', text: 'read the style guide' }],
    ['Add set up the VPN to my list', { kind: 'add', text: 'set up the VPN' }],
    ['add pair with Bo to my to-do list.', { kind: 'add', text: 'pair with Bo' }],
    ["What's on my list?", { kind: 'list' }],
    ['whats on my todo list', { kind: 'list' }],
    ['Mark the deploy one as done', { kind: 'complete', id: null, query: 'the deploy one' }],
    ['Remind me to ask Bo about tests [mock:slow]', { kind: 'add', text: 'ask Bo about tests' }],
  ])('maps "%s"', (message, action) => {
    expect(mockIntent(message)).toEqual(action);
  });

  it.each([
    'How do we name branches?',
    'Can you remind me how deploys work?',
    'What is on the menu?',
    'Mark my words',
  ])('leaves "%s" as an ordinary message', (message) => {
    expect(mockIntent(message)).toBeNull();
  });
});

describe('ollamaEngine and to-dos (B-11)', () => {
  it('declares no tools, sends no to-dos, and yields only text for a to-do phrase', async () => {
    const fetchImpl = respond(
      [
        JSON.stringify({ message: { content: 'I cannot manage your list.' } }),
        '{"done":true}',
      ].join('\n'),
    );
    const chunks = await all(
      ollamaEngine({ baseUrl: 'http://127.0.0.1:11434/', model: 'phi3', fetchImpl }).stream({
        ...input(),
        messages: [{ role: 'user', content: 'Remind me to ask Ana how deploys work' }],
        todos: [{ id: 't1', text: 'read the style guide' }],
      }),
    );
    expect(chunks.every((chunk) => typeof chunk === 'string')).toBe(true);
    const body = JSON.parse(vi.mocked(fetchImpl).mock.calls[0][1].body as string) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty('tools');
    expect(JSON.stringify(body)).not.toContain('read the style guide');
  });
});
