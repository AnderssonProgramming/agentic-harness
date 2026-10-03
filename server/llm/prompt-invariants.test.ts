// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MAX_MESSAGE_LENGTH,
  MAX_TODO_ID_LENGTH,
  MAX_TODO_LENGTH,
  MAX_TODOS_SENT,
} from '../../src/shared/llm/limits.ts';
import type { StreamEvent } from '../../src/shared/llm/protocol.ts';
import type { ChatCoreOptions } from './chat-core.ts';
import { LLM_CONFIG } from './config.ts';
import type { Engine, EngineName, EngineStreamInput } from './engines/types.ts';
import { createChatHandler } from './handler.ts';
import {
  buildKnowledge,
  documentBlock,
  knowledgeFile,
  maxPromptAdditions,
  type KnowledgeBase,
  type KnowledgeFile,
} from './knowledge.ts';
import { SYSTEM_PROMPT } from './system-prompt.ts';
import { MAX_PROMPT_ADDITIONS, promptAdditionsLength } from './todo-tools.ts';

// Property-style check of Amendment 1's invariants (IN-02, LLM-05) over many request shapes.
// Deterministic: a fixed-seed generator, so every run sends the same requests.
// Unrestricted: some bodies are over maxRequestBytes, and every request reuses fetch's keep-alive
// pool, so an oversized body that poisoned its connection would hang a later case (P-01).
// B-06 (Amendment 1 of its contract): every case also has a generated knowledge set and engine,
// and LLM-05's bound is per engine: MAX_PROMPT_ADDITIONS plus that engine's knowledge budget.

const SEED = 20261002;
const KNOWLEDGE_SEED = 20261003;
const CASES = 150;

/** mulberry32: a small seeded PRNG, so the request shapes are the same on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seeded(SEED);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];

// Lengths on both sides of every limit, plus ordinary ones.
const MESSAGE_LENGTHS = [0, 1, 50, 1000, MAX_MESSAGE_LENGTH - 1, MAX_MESSAGE_LENGTH];
const OVER_LONG_MESSAGE = MAX_MESSAGE_LENGTH + 1;
const TODO_COUNTS = [0, 1, 10, MAX_TODOS_SENT, MAX_TODOS_SENT + 1];
const ID_LENGTHS = [1, 8, MAX_TODO_ID_LENGTH, MAX_TODO_ID_LENGTH + 1, 5000];
const TEXT_LENGTHS = [1, 30, MAX_TODO_LENGTH, MAX_TODO_LENGTH + 1];

interface Shape {
  messages: { role: 'user' | 'assistant'; content: string }[];
  todos: { id: string; text: string }[];
}

function generateShape(): Shape {
  // 70 and 100 messages of up to 4,000 characters make bodies over maxRequestBytes (P-01).
  const count = pick([1, 2, 3, 6, 12, 30, 60, 70, 100]);
  // Some shapes are mostly back-to-back user turns (failed replies), others alternate.
  const userBias = pick([0.5, 0.9, 1]);
  // Some shapes fill every message, so the longest ones are over maxRequestBytes.
  const full = random() < 0.15;
  const messages: Shape['messages'] = Array.from({ length: count }, (_, index) => {
    const role = index === count - 1 || random() < userBias ? 'user' : 'assistant';
    const length =
      random() < 0.03 ? OVER_LONG_MESSAGE : full ? MAX_MESSAGE_LENGTH : pick(MESSAGE_LENGTHS);
    return { role, content: 'm'.repeat(length) };
  });
  // A rarely-rejected shape for the to-dos: mostly within limits, sometimes one field over.
  const idLength = random() < 0.8 ? MAX_TODO_ID_LENGTH : pick(ID_LENGTHS);
  const textLength = random() < 0.8 ? pick([1, 30, MAX_TODO_LENGTH]) : pick(TEXT_LENGTHS);
  const todos = Array.from({ length: pick(TODO_COUNTS) }, (_, index) => ({
    id: String(index).padStart(idLength, 'i'),
    text: 't'.repeat(textLength),
  }));
  return { messages, todos };
}

// The knowledge sets come from their own generator, so the request shapes above stay the same.
const knowledgeRandom = seeded(KNOWLEDGE_SEED);
const pickK = <T>(items: readonly T[]): T => items[Math.floor(knowledgeRandom() * items.length)];

const ENGINES: readonly EngineName[] = ['anthropic', 'ollama', 'mock'];
const FILE_COUNTS = [0, 1, 4, 12, 40];
// Both sides of each budget and of the 50 KB limit, plus ordinary sizes.
const FILE_LENGTHS = [
  0, 10, 700, 3_000, 7_900, 8_000, 12_000, 39_900, 40_000, 51_200, 51_201, 80_000,
];
// Fake key fixtures, built from parts so no key-shaped literal sits in the repository.
const FAKE_KEYS = [
  ['sk', 'ant', 'FAKEFIXTURE0000notakey'].join('-'),
  ['-----BEGIN', 'PRIVATE KEY-----\nFAKEFIXTURE\n-----END PRIVATE KEY-----'].join(' '),
  `${['api', 'key'].join('_')} = "FAKEFIXTURE1234"`,
];

function generateKnowledge(): KnowledgeFile[] {
  return Array.from({ length: pickK(FILE_COUNTS) }, (_, index) => {
    // Names in random order, so the input order never matches the alphabetical one.
    const name = `${pickK(['z', 'm', 'a'])}-${String(index).padStart(2, '0')}.md`;
    const length = pickK(FILE_LENGTHS);
    // Some files are multi-byte, so bytes and characters differ around the 50 KB limit.
    const filler = knowledgeRandom() < 0.2 ? '€' : 'k';
    const secret = knowledgeRandom() < 0.1 ? `\n${pickK(FAKE_KEYS)}\n` : '';
    const content = `# ${name}\n${secret}${filler.repeat(length)}`;
    return knowledgeFile(name, content);
  });
}

const calls: EngineStreamInput[] = [];
let currentEngine: EngineName = 'mock';
const recordingEngine = (name: EngineName): Engine => ({
  name,
  model: 'recording',
  actions: true,
  async *stream(input) {
    calls.push(input);
    await Promise.resolve();
    yield 'ok';
  },
});

let server: Server | undefined;
let url = '';
// The handler reads its options on every request, so each case sets its own knowledge set.
const options: ChatCoreOptions = {
  env: () => ({ INFERENCE_ENGINE: 'mock' }),
  engineFor: () => recordingEngine(currentEngine),
};

beforeAll(async () => {
  const handle = createChatHandler(options);
  const created = createServer((req, res) => {
    void handle(req, res);
  });
  server = created;
  await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${String((created.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
});

async function post(body: Shape): Promise<StreamEvent | undefined> {
  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
  const lines = (await response.text()).split('\n').filter(Boolean);
  return lines.map((line) => JSON.parse(line) as StreamEvent).at(-1);
}

/**
 * Every generated document is either sent whole to this engine, or absent and listed as skipped;
 * none is cut, and no key fixture is ever sent.
 */
function expectWholeOrSkipped(
  system: string,
  files: readonly KnowledgeFile[],
  knowledge: KnowledgeBase,
  engine: EngineName,
  label: string,
): void {
  // Booleans, not toContain: a failure must not print a prompt of tens of thousands of characters.
  expect(system.includes('FAKEFIXTURE'), `${label}: a key fixture was sent`).toBe(false);
  const skipped = new Set(knowledge.skipped.map((s) => s.name));
  for (const file of files) {
    if (system.includes(`<document source="${file.name}">`)) {
      expect(system.includes(documentBlock(file.name, file.content ?? '')), label).toBe(true);
      expect(knowledge.included[engine], label).toContain(file.name);
    } else {
      expect(skipped.has(file.name), `${label}: ${file.name} missing but not listed`).toBe(true);
      expect(knowledge.warning ?? '', label).toContain(file.name);
    }
  }
}

describe('what reaches the engine, over generated request shapes (IN-02, LLM-05)', () => {
  it(`holds both invariants for ${String(CASES)} shapes from seed ${String(SEED)}`, async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const tally = {
      accepted: 0,
      rejected: 0,
      oversized: 0,
      acceptedMergedNewest: 0,
      acceptedTrimmed: 0,
      // B-06: the knowledge paths the bound must hold on.
      knowledgeNearBudget: 0,
      anthropicOverOllamaBudget: 0,
      skippedOverBudget: 0,
      skippedTooLarge: 0,
      skippedSecret: 0,
      fullTodosAndKnowledge: 0,
    };

    for (let index = 0; index < CASES; index += 1) {
      const shape = generateShape();
      const files = generateKnowledge();
      const knowledge = buildKnowledge(files);
      currentEngine = pickK(ENGINES);
      options.knowledge = knowledge;
      const before = calls.length;
      if (Buffer.byteLength(JSON.stringify(shape)) > LLM_CONFIG.maxRequestBytes)
        tally.oversized += 1;
      const label = `case ${String(index)}: ${String(shape.messages.length)} messages, ${String(shape.todos.length)} to-dos, ${String(JSON.stringify(shape).length)} bytes, ${currentEngine}, ${String(files.length)} documents`;
      const last = await post(shape).catch((error: unknown) => {
        throw new Error(`${label}: ${String(error)}`);
      });

      if (last?.type === 'error') {
        expect(last.error.code, label).toBe('bad_request');
        expect(calls.length, `${label}: the engine must not be called`).toBe(before);
        tally.rejected += 1;
        continue;
      }

      expect(last, label).toEqual({ type: 'done' });
      expect(calls.length, label).toBe(before + 1);
      const input = calls.at(-1);
      if (input === undefined) throw new Error(`${label}: the engine received nothing`);

      // IN-02: everything passed to the engine, the merged newest turn included, fits the budget.
      const sent = input.messages.reduce((total, turn) => total + turn.content.length, 0);
      expect(sent, label).toBeLessThanOrEqual(LLM_CONFIG.historyChars);
      // LLM-05, per engine since B-06: what the server adds is bounded, and so is every id in it.
      expect(promptAdditionsLength(input.system, input.todos), label).toBeLessThanOrEqual(
        maxPromptAdditions(currentEngine),
      );
      // The two parts hold their own limits: knowledge alone never pushes a request over.
      expect(promptAdditionsLength(SYSTEM_PROMPT, input.todos), label).toBeLessThanOrEqual(
        MAX_PROMPT_ADDITIONS,
      );
      const sentKnowledge = input.system.slice(SYSTEM_PROMPT.length);
      expect(input.system === SYSTEM_PROMPT + knowledge.text[currentEngine], label).toBe(true);
      expect(sentKnowledge.length, label).toBeLessThanOrEqual(
        LLM_CONFIG.knowledgeBudgetChars[currentEngine],
      );
      expectWholeOrSkipped(input.system, files, knowledge, currentEngine, label);
      expect(Math.max(0, ...input.todos.map((todo) => todo.id.length)), label).toBeLessThanOrEqual(
        MAX_TODO_ID_LENGTH,
      );

      tally.accepted += 1;
      const budget = LLM_CONFIG.knowledgeBudgetChars[currentEngine];
      if (sentKnowledge.length >= budget * 0.75) tally.knowledgeNearBudget += 1;
      if (sentKnowledge.length > LLM_CONFIG.knowledgeBudgetChars.ollama)
        tally.anthropicOverOllamaBudget += 1;
      const reasons = knowledge.skipped.map((s) => s.reason);
      if (reasons.some((r) => r.includes(currentEngine))) tally.skippedOverBudget += 1;
      if (reasons.some((r) => r.startsWith('over ') && r.endsWith(' bytes')))
        tally.skippedTooLarge += 1;
      if (reasons.some((r) => r.startsWith('contains a key pattern'))) tally.skippedSecret += 1;
      if (input.todos.length === MAX_TODOS_SENT && sentKnowledge.length >= budget * 0.75)
        tally.fullTodosAndKnowledge += 1;
      if ((input.messages.at(-1)?.content.length ?? 0) > MAX_MESSAGE_LENGTH)
        tally.acceptedMergedNewest += 1;
      const total = shape.messages.reduce((sum, turn) => sum + turn.content.length, 0);
      if (sent < total) tally.acceptedTrimmed += 1;
    }

    // The table must exercise every path, or the invariants above held vacuously.
    expect(tally.accepted).toBeGreaterThanOrEqual(20);
    expect(tally.rejected).toBeGreaterThanOrEqual(20);
    // Oversized bodies are rejected above and, P-01, the cases after them are still answered.
    expect(tally.oversized).toBeGreaterThanOrEqual(5);
    expect(tally.acceptedMergedNewest).toBeGreaterThanOrEqual(5);
    expect(tally.acceptedTrimmed).toBeGreaterThanOrEqual(5);
    // The knowledge paths must be exercised too, or the per-engine bound held vacuously.
    const counts = JSON.stringify(tally);
    expect(tally.knowledgeNearBudget, counts).toBeGreaterThanOrEqual(10);
    expect(tally.anthropicOverOllamaBudget, counts).toBeGreaterThanOrEqual(3);
    expect(tally.skippedOverBudget, counts).toBeGreaterThanOrEqual(10);
    expect(tally.skippedTooLarge, counts).toBeGreaterThanOrEqual(10);
    expect(tally.skippedSecret, counts).toBeGreaterThanOrEqual(5);
    expect(tally.fullTodosAndKnowledge, counts).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
