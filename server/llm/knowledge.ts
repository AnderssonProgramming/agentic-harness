import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LLM_CONFIG } from './config.ts';
import type { EngineName } from './engines/types.ts';
import { MAX_PROMPT_ADDITIONS } from './todo-tools.ts';

/**
 * The team's documents (B-06, ADR-12): `knowledge/*.md`, read once per server start, each sent
 * whole as a `<document source="…">` block after the system prompt. Nothing here ever fails a
 * request: whatever can't be sent is skipped and named in one server-console warning.
 */

const ENGINES: readonly EngineName[] = ['anthropic', 'ollama', 'mock'];

/** One file as read from the folder. `content` is null when it wasn't read (too large, or unreadable). */
export interface KnowledgeFile {
  name: string;
  bytes: number;
  content: string | null;
}

export interface SkippedFile {
  name: string;
  reason: string;
}

export interface KnowledgeBase {
  /** What each engine gets appended to its system prompt: whole documents only, within its budget. */
  text: Readonly<Record<EngineName, string>>;
  /** The documents each engine gets, in the order sent. */
  included: Readonly<Record<EngineName, readonly string[]>>;
  /** Every file not sent to at least one engine, with why. */
  skipped: readonly SkippedFile[];
  /** The server-console warning naming every skipped file, or null when nothing was skipped. */
  warning: string | null;
}

export const EMPTY_KNOWLEDGE: KnowledgeBase = {
  text: { anthropic: '', ollama: '', mock: '' },
  included: { anthropic: [], ollama: [], mock: [] },
  skipped: [],
  warning: null,
};

/**
 * Most characters the server adds to a request for this engine (LLM-05, per engine since B-06):
 * the instructions, to-dos and tool definitions, plus the engine's knowledge budget.
 */
export function maxPromptAdditions(engine: EngineName): number {
  return MAX_PROMPT_ADDITIONS + LLM_CONFIG.knowledgeBudgetChars[engine];
}

// A pasted key in a convention doc would go to the provider (ADR-03), so such a file is never sent.
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-ant-/,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY/,
  /(?:api|secret|access|auth)[_-]?(?:key|token)["']?\s*[:=]\s*["']?[\w\-./+]{8,}/i,
];

export function containsSecret(content: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(content));
}

const attribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** One document as the model sees it, with the blank line that separates it from what's before. */
export function documentBlock(name: string, content: string): string {
  const body = content.endsWith('\n') ? content : `${content}\n`;
  return `\n\n<document source="${attribute(name)}">\n${body}</document>`;
}

/** A fake or in-memory file, for tests. */
export function knowledgeFile(name: string, content: string): KnowledgeFile {
  return { name, bytes: Buffer.byteLength(content, 'utf8'), content };
}

/**
 * Pure: decides what each engine receives. Files go in alphabetical order (by code point); a file
 * over the size limit, holding a key pattern, or unreadable is skipped for every engine; a file
 * that doesn't fit what's left of an engine's budget is skipped for that engine, and later, smaller
 * files may still fit. A document is never cut.
 */
export function buildKnowledge(
  files: readonly KnowledgeFile[],
  budgets: Readonly<Record<EngineName, number>> = LLM_CONFIG.knowledgeBudgetChars,
  maxFileBytes: number = LLM_CONFIG.knowledgeMaxFileBytes,
): KnowledgeBase {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const skipped: SkippedFile[] = [];
  const sendable: { name: string; block: string }[] = [];
  for (const file of sorted) {
    if (file.bytes > maxFileBytes)
      skipped.push({ name: file.name, reason: `over ${String(maxFileBytes)} bytes` });
    else if (file.content === null) skipped.push({ name: file.name, reason: 'unreadable' });
    else if (containsSecret(file.content))
      skipped.push({ name: file.name, reason: 'contains a key pattern; never sent' });
    else sendable.push({ name: file.name, block: documentBlock(file.name, file.content) });
  }

  const text = { anthropic: '', ollama: '', mock: '' };
  const included: Record<EngineName, string[]> = { anthropic: [], ollama: [], mock: [] };
  const overBudget = new Map<string, EngineName[]>();
  for (const engine of ENGINES) {
    for (const { name, block } of sendable) {
      if (text[engine].length + block.length <= budgets[engine]) {
        text[engine] += block;
        included[engine].push(name);
      } else {
        overBudget.set(name, [...(overBudget.get(name) ?? []), engine]);
      }
    }
  }
  for (const { name } of sendable) {
    const engines = overBudget.get(name);
    if (engines)
      skipped.push({
        name,
        reason: `over the knowledge budget for ${engines.map((e) => `${e} (${String(budgets[e])} characters)`).join(', ')}`,
      });
  }

  const warning =
    skipped.length === 0
      ? null
      : `[knowledge] Skipped ${String(skipped.length)} file(s): ${skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}`;
  return { text, included, skipped, warning };
}

/**
 * The folder to read: the first candidate that exists. Locally and under `netlify serve` the
 * working directory is the project root; on Netlify the Function runs from its task root, where
 * `included_files` puts `knowledge/`.
 */
export function knowledgeDirCandidates(cwd: string, taskRoot: string | undefined): string[] {
  const roots = taskRoot && taskRoot !== cwd ? [cwd, taskRoot] : [cwd];
  return roots.map((root) => join(root, LLM_CONFIG.knowledgeDir));
}

/**
 * Reads `*.md` from the first existing folder and builds the knowledge base, once. Logs the
 * warning (file names and reasons only, never content). Never throws.
 */
export function loadKnowledge(
  dirs: readonly string[],
  warn: (message: string) => void = console.warn,
): KnowledgeBase {
  const dir = dirs.find((candidate) => existsSync(candidate));
  if (dir === undefined) {
    warn(`[knowledge] No knowledge folder found; the assistant has no team documents.`);
    return EMPTY_KNOWLEDGE;
  }
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name);
  } catch {
    warn(`[knowledge] The knowledge folder can't be read; the assistant has no team documents.`);
    return EMPTY_KNOWLEDGE;
  }
  const files = names.map((name): KnowledgeFile => {
    try {
      const path = join(dir, name);
      const bytes = statSync(path).size;
      if (bytes > LLM_CONFIG.knowledgeMaxFileBytes) return { name, bytes, content: null };
      return { name, bytes, content: readFileSync(path, 'utf8') };
    } catch {
      return { name, bytes: 0, content: null };
    }
  });
  const knowledge = buildKnowledge(files);
  if (knowledge.warning) warn(knowledge.warning);
  return knowledge;
}
