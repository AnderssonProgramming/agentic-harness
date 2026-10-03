// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LLM_CONFIG } from './config.ts';
import {
  buildKnowledge,
  containsSecret,
  documentBlock,
  knowledgeDirCandidates,
  knowledgeFile,
  loadKnowledge,
  maxPromptAdditions,
} from './knowledge.ts';
import { MAX_PROMPT_ADDITIONS } from './todo-tools.ts';

// Fake key fixtures, built from parts so no key-shaped literal sits in the repository.
const FAKE_ANTHROPIC_KEY = ['sk', 'ant', 'FAKE0000fixture0000notakey'].join('-');
const FAKE_PEM = [
  '-----BEGIN',
  'RSA PRIVATE KEY-----\nFAKEFIXTURE\n-----END RSA PRIVATE KEY-----',
].join(' ');
const FAKE_ASSIGNMENT = `${['API', 'KEY'].join('_')}="fake1234fixture5678"`;

const temps: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'knowledge-test-'));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('buildKnowledge', () => {
  it('sends each file whole as a document block, in alphabetical order whatever the input order', () => {
    const kb = buildKnowledge([
      knowledgeFile('deploys.md', '# Deploys\nShip on Tuesdays.'),
      knowledgeFile('branch-naming.md', '# Branches\nfeat/b-06-slug\n'),
    ]);
    for (const engine of ['anthropic', 'ollama', 'mock'] as const) {
      expect(kb.included[engine]).toEqual(['branch-naming.md', 'deploys.md']);
      expect(kb.text[engine]).toBe(
        '\n\n<document source="branch-naming.md">\n# Branches\nfeat/b-06-slug\n</document>' +
          '\n\n<document source="deploys.md">\n# Deploys\nShip on Tuesdays.\n</document>',
      );
    }
    expect(kb.skipped).toEqual([]);
    expect(kb.warning).toBeNull();
  });

  it('skips a file over 50 KB and names it in the warning (B-06 criterion 3)', () => {
    const big = 'x'.repeat(LLM_CONFIG.knowledgeMaxFileBytes + 1);
    const kb = buildKnowledge([knowledgeFile('big.md', big), knowledgeFile('small.md', 'ok')]);
    expect(LLM_CONFIG.knowledgeMaxFileBytes).toBe(51_200);
    for (const engine of ['anthropic', 'ollama', 'mock'] as const) {
      expect(kb.included[engine]).toEqual(['small.md']);
      expect(kb.text[engine]).not.toContain('xxxx');
    }
    expect(kb.skipped).toEqual([{ name: 'big.md', reason: 'over 51200 bytes' }]);
    expect(kb.warning).toContain('big.md (over 51200 bytes)');
    // Exactly at the limit is still sent (Anthropic's budget is smaller, so it's skipped there).
    const atLimit = buildKnowledge(
      [knowledgeFile('edge.md', 'y'.repeat(LLM_CONFIG.knowledgeMaxFileBytes))],
      { anthropic: 60_000, ollama: 60_000, mock: 60_000 },
    );
    expect(atLimit.included.anthropic).toEqual(['edge.md']);
  });

  it('measures the size limit in bytes, not characters', () => {
    // 20,000 three-byte characters: 60,000 bytes, though only 20,000 characters.
    const kb = buildKnowledge([knowledgeFile('wide.md', '€'.repeat(20_000))]);
    expect(kb.skipped.map((s) => s.name)).toEqual(['wide.md']);
  });

  it('holds the Anthropic and Ollama budgets: alphabetical order decides, whole files only, skips listed', () => {
    // Given in reverse order on purpose.
    const files = [
      knowledgeFile('d.md', 'd'.repeat(1_000)),
      knowledgeFile('c.md', 'c'.repeat(30_000)),
      knowledgeFile('b.md', 'b'.repeat(5_000)),
      knowledgeFile('a.md', 'a'.repeat(5_000)),
    ];
    const kb = buildKnowledge(files);
    expect(LLM_CONFIG.knowledgeBudgetChars).toEqual({
      anthropic: 40_000,
      ollama: 8_000,
      mock: 8_000,
    });
    // Anthropic: a + b + c is over 40,000 with the block markup, so c is left out; d still fits.
    expect(kb.included.anthropic).toEqual(['a.md', 'b.md', 'd.md']);
    // Ollama and the mock: a fits; b would pass 8,000; c is too big; d still fits.
    expect(kb.included.ollama).toEqual(['a.md', 'd.md']);
    expect(kb.included.mock).toEqual(['a.md', 'd.md']);
    for (const engine of ['anthropic', 'ollama', 'mock'] as const) {
      expect(kb.text[engine].length).toBeLessThanOrEqual(LLM_CONFIG.knowledgeBudgetChars[engine]);
      // Every included document is whole; every other one is absent.
      for (const file of files) {
        const block = documentBlock(file.name, file.content ?? '');
        if (kb.included[engine].includes(file.name)) expect(kb.text[engine]).toContain(block);
        else expect(kb.text[engine]).not.toContain(`source="${file.name}"`);
      }
    }
    expect(kb.skipped).toEqual([
      {
        name: 'b.md',
        reason: 'over the knowledge budget for ollama (8000 characters), mock (8000 characters)',
      },
      {
        name: 'c.md',
        reason:
          'over the knowledge budget for anthropic (40000 characters), ollama (8000 characters), mock (8000 characters)',
      },
    ]);
    expect(kb.warning).toMatch(/^\[knowledge\] Skipped 2 file\(s\): b\.md \(.*\); c\.md \(/);
  });

  it('never sends a file with a key pattern, and names it in the warning (B-06 criterion 5)', () => {
    const kb = buildKnowledge([
      knowledgeFile('a-anthropic.md', `Our key is ${FAKE_ANTHROPIC_KEY} for now.`),
      knowledgeFile('b-pem.md', `Deploy key:\n${FAKE_PEM}\n`),
      knowledgeFile('c-assignment.md', `Put this in .env:\n${FAKE_ASSIGNMENT}\n`),
      knowledgeFile('d-clean.md', 'Ask Ana about deploys.'),
    ]);
    for (const engine of ['anthropic', 'ollama', 'mock'] as const) {
      expect(kb.included[engine]).toEqual(['d-clean.md']);
      expect(kb.text[engine]).not.toContain('FAKE');
      expect(kb.text[engine]).not.toContain('fake1234');
    }
    expect(kb.skipped.map((s) => s.name)).toEqual([
      'a-anthropic.md',
      'b-pem.md',
      'c-assignment.md',
    ]);
    for (const name of ['a-anthropic.md', 'b-pem.md', 'c-assignment.md'])
      expect(kb.warning).toContain(`${name} (contains a key pattern; never sent)`);
    // The warning names files only: no fixture content reaches the console.
    expect(kb.warning).not.toContain('FAKE');
    expect(kb.warning).not.toContain('fake1234');
  });

  it('recognizes the key patterns, and not prose about keys', () => {
    expect(containsSecret(FAKE_ANTHROPIC_KEY)).toBe(true);
    expect(containsSecret(FAKE_PEM)).toBe(true);
    expect(containsSecret(FAKE_ASSIGNMENT)).toBe(true);
    expect(containsSecret("apiKey: 'fake1234fixture'")).toBe(true);
    expect(containsSecret('access_token = fake1234fixture')).toBe(true);
    expect(containsSecret('Never paste an API key in a document.')).toBe(false);
    expect(containsSecret('Set ANTHROPIC_API_KEY= in your .env (empty in .env.example).')).toBe(
      false,
    );
    expect(containsSecret('api_key=<your key>')).toBe(false);
  });

  it('skips an unreadable file', () => {
    const kb = buildKnowledge([{ name: 'locked.md', bytes: 10, content: null }]);
    expect(kb.skipped).toEqual([{ name: 'locked.md', reason: 'unreadable' }]);
    expect(kb.text.anthropic).toBe('');
  });

  it('derives the prompt bound per engine from the knowledge budget (Amendment 1, LLM-05)', () => {
    expect(maxPromptAdditions('anthropic')).toBe(MAX_PROMPT_ADDITIONS + 40_000);
    expect(maxPromptAdditions('ollama')).toBe(MAX_PROMPT_ADDITIONS + 8_000);
    expect(maxPromptAdditions('mock')).toBe(MAX_PROMPT_ADDITIONS + 8_000);
  });
});

describe('loadKnowledge', () => {
  it("loads the PO's four documents whole for every engine, with no warning", () => {
    const warn = vi.fn();
    const kb = loadKnowledge([resolve('knowledge')], warn);
    const all = ['branch-naming.md', 'code-review.md', 'deploys.md', 'first-week.md'];
    expect(kb.included).toEqual({ anthropic: all, ollama: all, mock: all });
    expect(kb.text.mock).toContain('<type>/<item-id>-<short-slug>');
    expect(warn).not.toHaveBeenCalled();
  });

  it('reads only *.md files, skips one over 50 KB without reading it, and warns once', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'b.md'), 'Second.');
    writeFileSync(join(dir, 'a.md'), 'First.');
    writeFileSync(join(dir, 'notes.txt'), 'Not markdown.');
    writeFileSync(join(dir, 'huge.md'), 'h'.repeat(LLM_CONFIG.knowledgeMaxFileBytes + 1));
    mkdirSync(join(dir, 'nested.md'));
    const warn = vi.fn();
    const kb = loadKnowledge([join(dir, 'missing'), dir], warn);
    expect(kb.included.anthropic).toEqual(['a.md', 'b.md']);
    expect(kb.text.anthropic).not.toContain('Not markdown');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[knowledge] Skipped 1 file(s): huge.md (over 51200 bytes)');
  });

  it('never throws: a missing folder gives no documents and a warning', () => {
    const warn = vi.fn();
    const kb = loadKnowledge([join(tempDir(), 'nowhere')], warn);
    expect(kb.text).toEqual({ anthropic: '', ollama: '', mock: '' });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[knowledge\] No knowledge folder/));
  });

  it('looks in the working directory first, then the Function task root', () => {
    expect(knowledgeDirCandidates('/repo', undefined)).toEqual([join('/repo', 'knowledge')]);
    expect(knowledgeDirCandidates('/repo', '/var/task')).toEqual([
      join('/repo', 'knowledge'),
      join('/var/task', 'knowledge'),
    ]);
  });
});
