// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '../../src/shared/llm/protocol.ts';
import { runChat } from './chat-core.ts';
import { LLM_CONFIG } from './config.ts';
import type { Env } from './engine.ts';
import type { Engine, EngineName } from './engines/types.ts';
import { upstreamFailure } from './errors.ts';

const NEVER = Number.POSITIVE_INFINITY;
const env: Env = { INFERENCE_ENGINE: 'mock', MOCK_DELAY_MS: '0' };

/** Waits like a provider would, and fails the way real engines do when the core aborts it. */
function wait(ms: number, signal: AbortSignal, name: EngineName): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = ms === NEVER ? undefined : setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(upstreamFailure(name, signal.reason, signal));
      },
      { once: true },
    );
  });
}

/** A fake engine that sends one chunk after each delay (in ms); NEVER stalls for good. */
function scriptedEngine(name: EngineName, delays: readonly number[]): Engine {
  return {
    name,
    model: 'scripted',
    actions: false,
    async *stream({ signal }) {
      for (const [index, ms] of delays.entries()) {
        await wait(ms, signal, name);
        yield `chunk${String(index)} `;
      }
    },
  };
}

function start(engine: Engine) {
  const events: StreamEvent[] = [];
  const finished = runChat(
    { env: () => env, engineFor: () => engine },
    {
      readBody: () => Promise.resolve({ messages: [{ role: 'user', content: 'Hi' }] }),
      send: (event) => events.push(event),
      clientGone: new AbortController().signal,
    },
  );
  return { events, finished };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('first-chunk and idle timeouts (B-13)', () => {
  const idle = LLM_CONFIG.idleTimeoutMs;

  it('uses the contract values: 120 s for Ollama, 30 s for Anthropic and the mock, 20 s idle', () => {
    expect(LLM_CONFIG.firstChunkTimeoutMs).toEqual({
      ollama: 120_000,
      anthropic: 30_000,
      mock: 30_000,
    });
    expect(idle).toBe(20_000);
  });

  it('completes when the first chunk arrives after the idle timeout but before the first-chunk timeout', async () => {
    const { events, finished } = start(scriptedEngine('ollama', [90_000, 1_000]));
    await vi.advanceTimersByTimeAsync(idle + 1);
    expect(events.map((e) => e.type)).toEqual(['start']);
    await vi.advanceTimersByTimeAsync(91_000);
    await finished;
    expect(events).toEqual([
      { type: 'start', engine: 'ollama', model: 'scripted', actions: false },
      { type: 'delta', text: 'chunk0 ' },
      { type: 'delta', text: 'chunk1 ' },
      { type: 'done' },
    ]);
  });

  it('ends in timeout when an engine sends one chunk and then stalls past the idle timeout', async () => {
    const { events, finished } = start(scriptedEngine('ollama', [1_000, NEVER]));
    await vi.advanceTimersByTimeAsync(1_000 + idle - 1);
    expect(events.at(-1)).toEqual({ type: 'delta', text: 'chunk0 ' });
    await vi.advanceTimersByTimeAsync(1);
    await finished;
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'timeout', engine: 'ollama', retryable: true },
    });
  });

  it.each(['ollama', 'anthropic', 'mock'] as const)(
    'ends in timeout when %s never sends a first chunk, exactly at its first-chunk timeout',
    async (name) => {
      const limit = LLM_CONFIG.firstChunkTimeoutMs[name];
      const { events, finished } = start(scriptedEngine(name, [NEVER]));
      await vi.advanceTimersByTimeAsync(limit - 1);
      expect(events.map((e) => e.type)).toEqual(['start']);
      await vi.advanceTimersByTimeAsync(1);
      await finished;
      expect(events.at(-1)).toMatchObject({
        type: 'error',
        error: { code: 'timeout', engine: name },
      });
    },
  );
});
