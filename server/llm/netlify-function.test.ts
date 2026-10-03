// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { config } from '../../netlify/functions/api.ts';
import { MAX_MESSAGE_LENGTH } from '../../src/shared/llm/limits.ts';
import type { EngineInfo, StreamEvent } from '../../src/shared/llm/protocol.ts';
import { LLM_CONFIG } from './config.ts';
import type { Engine } from './engines/types.ts';
import { createWebApiHandler } from './web-handler.ts';

const SITE = 'https://compass.example';

function chatRequest(body: unknown): Request {
  return new Request(`${SITE}${LLM_CONFIG.route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function events(response: Response): Promise<StreamEvent[]> {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('application/x-ndjson');
  return (await response.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StreamEvent);
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the Netlify Function entry point (ADR-13)', () => {
  beforeEach(() => {
    vi.stubEnv('INFERENCE_ENGINE', 'mock');
    vi.stubEnv('MOCK_DELAY_MS', '0');
  });

  it('streams start, deltas and done as NDJSON for /api/chat', async () => {
    const stream = await events(
      api(chatRequest({ messages: [{ role: 'user', content: 'Where do I start?' }] })),
    );
    expect(stream[0]).toMatchObject({ type: 'start', engine: 'mock' });
    expect(stream.slice(1, -1).every((event) => event.type === 'delta')).toBe(true);
    expect(stream.length).toBeGreaterThan(2);
    expect(stream.at(-1)).toEqual({ type: 'done' });
    const text = stream.map((event) => (event.type === 'delta' ? event.text : '')).join('');
    expect(text).toContain('Where do I start?');
  });

  it('answers bad_request for a user message over the limit, before any engine starts (F-01)', async () => {
    const stream = await events(
      api(
        chatRequest({ messages: [{ role: 'user', content: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) }] }),
      ),
    );
    expect(stream).toHaveLength(1);
    expect(stream[0]).toMatchObject({ type: 'error', error: { code: 'bad_request' } });
  });

  it('answers bad_request for a body over maxRequestBytes and for a body that is not JSON', async () => {
    const huge = await events(api(chatRequest('x'.repeat(LLM_CONFIG.maxRequestBytes + 1))));
    expect(huge).toHaveLength(1);
    expect(huge[0]).toMatchObject({ type: 'error', error: { code: 'bad_request' } });
    const broken = await events(api(chatRequest('{not json')));
    expect(broken[0]).toMatchObject({ type: 'error', error: { code: 'bad_request' } });
  });

  it('answers EngineInfo for GET /api/engine', async () => {
    const response = api(new Request(`${SITE}${LLM_CONFIG.engineRoute}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()) as EngineInfo).toEqual({
      engine: 'mock',
      model: 'echo',
      actions: true,
    });
  });

  it('answers 503 with a config error for /api/engine when the production engine has no key', async () => {
    vi.stubEnv('INFERENCE_ENGINE', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const response = api(new Request(`${SITE}${LLM_CONFIG.engineRoute}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'config' } });
  });

  it('rejects the wrong method on each route and unknown paths', () => {
    expect(api(new Request(`${SITE}${LLM_CONFIG.route}`)).status).toBe(405);
    expect(api(new Request(`${SITE}${LLM_CONFIG.engineRoute}`, { method: 'POST' })).status).toBe(
      405,
    );
    expect(api(new Request(`${SITE}/api/other`)).status).toBe(404);
  });

  it('serves exactly the two API routes, with the decided rate limit', () => {
    expect(config.path).toEqual([LLM_CONFIG.route, LLM_CONFIG.engineRoute]);
    expect(config.rateLimit).toEqual({
      windowLimit: 6,
      windowSize: 180,
      aggregateBy: ['ip', 'domain'],
    });
  });
});

describe('the Web adapter', () => {
  it('stops the provider request when the client cancels the stream', async () => {
    let aborted = false;
    const engine: Engine = {
      name: 'mock',
      model: 'hang',
      actions: true,
      async *stream({ signal }) {
        yield 'first ';
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        });
      },
    };
    const handle = createWebApiHandler({ env: () => ({}), engineFor: () => engine });
    const response = handle(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let seen = '';
    while (!seen.includes('first ')) {
      const { value } = await reader.read();
      seen += decoder.decode(value);
    }
    await reader.cancel();
    await vi.waitFor(() => {
      expect(aborted).toBe(true);
    });
  });
});
