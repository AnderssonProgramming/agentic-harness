// @vitest-environment node
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '../../src/shared/llm/protocol.ts';
import { runChat } from './chat-core.ts';
import type { Engine, EngineName, EngineStreamInput } from './engines/types.ts';
import { buildKnowledge, documentBlock, knowledgeFile, loadKnowledge } from './knowledge.ts';
import { SYSTEM_PROMPT } from './system-prompt.ts';

// B-06 criterion 1: the documents in knowledge/ reach the system prompt with each request.

function recordingEngine(name: EngineName, calls: EngineStreamInput[]): Engine {
  return {
    name,
    model: 'recording',
    actions: true,
    async *stream(input) {
      calls.push(input);
      await Promise.resolve();
      yield 'ok';
    },
  };
}

async function ask(engine: Engine, knowledge: Parameters<typeof runChat>[0]['knowledge']) {
  const events: StreamEvent[] = [];
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  await runChat(
    { env: () => ({}), engineFor: () => engine, knowledge },
    {
      readBody: () =>
        Promise.resolve({
          messages: [{ role: 'user', content: 'What is our branch naming convention?' }],
        }),
      send: (event) => events.push(event),
      clientGone: new AbortController().signal,
    },
  );
  return events.at(-1);
}

describe('knowledge in the system prompt', () => {
  it("sends the PO's documents from knowledge/ in system, on every request", async () => {
    const knowledge = loadKnowledge([resolve('knowledge')], () => undefined);
    const calls: EngineStreamInput[] = [];
    const engine = recordingEngine('anthropic', calls);
    expect(await ask(engine, knowledge)).toEqual({ type: 'done' });
    expect(await ask(engine, knowledge)).toEqual({ type: 'done' });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.system.startsWith(SYSTEM_PROMPT)).toBe(true);
      expect(call.system).toContain('<document source="branch-naming.md">');
      expect(call.system).toContain('<type>/<item-id>-<short-slug>');
      expect(call.system).toBe(SYSTEM_PROMPT + knowledge.text.anthropic);
    }
  });

  it('gives each engine its own budgeted set', async () => {
    const knowledge = buildKnowledge([
      knowledgeFile('a.md', 'a'.repeat(5_000)),
      knowledgeFile('b.md', 'b'.repeat(5_000)),
    ]);
    const anthropic: EngineStreamInput[] = [];
    const ollama: EngineStreamInput[] = [];
    await ask(recordingEngine('anthropic', anthropic), knowledge);
    await ask(recordingEngine('ollama', ollama), knowledge);
    expect(anthropic[0]?.system).toContain(documentBlock('b.md', 'b'.repeat(5_000)));
    expect(ollama[0]?.system).toContain(documentBlock('a.md', 'a'.repeat(5_000)));
    expect(ollama[0]?.system).not.toContain('source="b.md"');
  });

  it('sends the plain system prompt when there are no documents', async () => {
    const calls: EngineStreamInput[] = [];
    await ask(recordingEngine('mock', calls), undefined);
    expect(calls[0]?.system).toBe(SYSTEM_PROMPT);
  });
});
