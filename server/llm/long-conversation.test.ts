// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestBody, streamChat } from '../../src/shared/llm/client.ts';
import type { ChatTurn } from '../../src/shared/llm/protocol.ts';
import { LLM_CONFIG } from './config.ts';
import type { Engine, EngineStreamInput } from './engines/types.ts';
import { createChatHandler } from './handler.ts';
import { trimHistory } from './history.ts';

// P-01: the browser's client and the real handler, together, on a conversation far over the body limit.

let server: Server | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  const running = server;
  server = undefined;
  if (running) await new Promise((resolve) => running.close(resolve));
});

async function start(engine: Engine): Promise<string> {
  const handle = createChatHandler({
    env: () => ({ INFERENCE_ENGINE: 'mock' }),
    engineFor: () => engine,
  });
  const created = createServer((req, res) => {
    void handle(req, res);
  });
  server = created;
  await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${String((created.address() as AddressInfo).port)}/api/chat`;
}

/** A conversation of `pairs` exchanges, each message `size` characters and numbered. */
function conversation(pairs: number, size: number): ChatTurn[] {
  return Array.from({ length: pairs * 2 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `${String(index)}:`.padEnd(size, index % 2 === 0 ? 'q' : 'a'),
  }));
}

describe('a long conversation (P-01, ERR-02)', () => {
  it('fits a 300 KB conversation under the body limit, keeping exactly what the model would get', () => {
    const messages = conversation(75, 2000);
    expect(Buffer.byteLength(JSON.stringify({ messages }))).toBeGreaterThan(300_000);
    const todos = Array.from({ length: 50 }, (_, index) => ({
      id: crypto.randomUUID(),
      text: `to-do ${String(index)}`.padEnd(200, '.'),
    }));

    const body = requestBody(messages, todos);
    expect(Buffer.byteLength(body)).toBeLessThan(LLM_CONFIG.maxRequestBytes);
    const sent = (JSON.parse(body) as { messages: ChatTurn[] }).messages;
    expect(sent).toEqual(messages.slice(-sent.length));
    expect(trimHistory(sent, LLM_CONFIG.historyChars)).toEqual(
      trimHistory(messages, LLM_CONFIG.historyChars),
    );
  });

  it('still gets replies, turn after turn, as the conversation grows past the limit', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const calls: EngineStreamInput[] = [];
    const url = await start({
      name: 'mock',
      model: 'recording',
      actions: true,
      async *stream(input) {
        calls.push(input);
        await Promise.resolve();
        yield 'ok';
      },
    });

    let history = conversation(70, 2000);
    for (let turn = 0; turn < 5; turn++) {
      const question: ChatTurn = { role: 'user', content: `question ${String(turn)}` };
      history = [...history, question];
      let reply = '';
      await streamChat(history, {
        endpoint: url,
        idleTimeoutMs: 3000,
        onDelta: (text) => (reply += text),
      });
      expect(reply).toBe('ok');
      expect(calls.at(-1)?.messages.at(-1)).toEqual(question);
      history = [...history, { role: 'assistant', content: 'a'.repeat(2000) }];
    }
    expect(Buffer.byteLength(JSON.stringify({ messages: history }))).toBeGreaterThan(
      LLM_CONFIG.maxRequestBytes,
    );
    expect(calls).toHaveLength(5);
  });
});
