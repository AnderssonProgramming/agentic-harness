import type { KnowledgeDoc } from '../../../shared/llm/protocol';

/**
 * B-07, ADR-14: the model is asked to end an answer from the team's documents with one line,
 * `Sources: a.md, b.md`. The prompt isn't the control: the browser parses that line from the
 * stored text on render and checks each name against the documents the server actually loaded.
 */

export interface CitedText {
  /** The reply without its Sources line (the whole text when there is none). */
  body: string;
  /** Every name the line lists, in order, without duplicates. Nothing is dropped. */
  sources: readonly string[];
}

/**
 * - `known`: a loaded document; shown as a chip that opens it.
 * - `unknown`: not a loaded document; shown as plain text, never clickable.
 * - `unchecked`: the list of documents couldn't be fetched, so the name can't be verified.
 */
export type CitationStatus = 'known' | 'unknown' | 'unchecked';

export interface Citation {
  source: string;
  status: CitationStatus;
  /** The document's title when it is known. */
  title: string | null;
}

// "Sources:", "Source:", with Markdown emphasis or a list marker around it, as models write it.
const SOURCES_LINE = /^[\s>*_-]*sources?[\s*_]*:(.*)$/i;
// Wrapping a model may add around a name: quotes, backticks, emphasis, brackets.
const NAME_WRAPPING = /^[\s"'`*_[(<]+|[\s"'`*_\])>.]+$/g;

/** Splits off the reply's last non-blank line when it is a Sources line. */
export function parseSources(text: string): CitedText {
  const lines = text.split('\n');
  let last = lines.length - 1;
  while (last >= 0 && (lines[last] ?? '').trim() === '') last--;
  const match = last >= 0 ? SOURCES_LINE.exec(lines[last] ?? '') : null;
  if (!match) return { body: text, sources: [] };
  const names = (match[1] ?? '')
    .split(/[,;]/)
    .map((name) => name.replace(NAME_WRAPPING, ''))
    .filter((name) => name !== '');
  return {
    body: lines.slice(0, last).join('\n').trimEnd(),
    sources: [...new Set(names)],
  };
}

/**
 * Whether a name is one of the loaded documents. Exact match only: the model is told the exact
 * names, and a near miss is shown as unknown rather than guessed at.
 */
export function findKnownSource(
  source: string,
  documents: readonly KnowledgeDoc[] | null,
): KnowledgeDoc | null {
  return documents?.find((doc) => doc.source === source) ?? null;
}

export function classifySources(
  sources: readonly string[],
  documents: readonly KnowledgeDoc[] | null,
): Citation[] {
  return sources.map((source) => {
    if (documents === null) return { source, status: 'unchecked', title: null };
    const doc = findKnownSource(source, documents);
    return doc
      ? { source, status: 'known', title: doc.title }
      : { source, status: 'unknown', title: null };
  });
}
