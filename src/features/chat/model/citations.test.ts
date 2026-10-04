import { describe, expect, it } from 'vitest';
import type { KnowledgeDoc } from '../../../shared/llm/protocol';
import { classifySources, findKnownSource, parseSources } from './citations';

const LOADED: KnowledgeDoc[] = [
  { source: 'branch-naming.md', title: 'Branch naming' },
  { source: 'code-review.md', title: 'Code review' },
];

describe('parseSources (B-07)', () => {
  it('splits an answer from knowledge/ into its body and the source names of its last line', () => {
    const text =
      'Branches are named `<type>/<item-id>-<short-slug>`, e.g. `feat/b-06-knowledge`.\n\nSources: branch-naming.md';
    expect(parseSources(text)).toEqual({
      body: 'Branches are named `<type>/<item-id>-<short-slug>`, e.g. `feat/b-06-knowledge`.',
      sources: ['branch-naming.md'],
    });
  });

  it('reads several names, the way models decorate them, without duplicates', () => {
    expect(parseSources('Answer.\nSources: branch-naming.md, code-review.md').sources).toEqual([
      'branch-naming.md',
      'code-review.md',
    ]);
    expect(
      parseSources(
        'Answer.\n**Sources:** `branch-naming.md`; "code-review.md", branch-naming.md.\n\n',
      ).sources,
    ).toEqual(['branch-naming.md', 'code-review.md']);
    expect(parseSources('Answer.\n- Source: [deploys.md]').sources).toEqual(['deploys.md']);
  });

  it('finds no source when no document applies and the answer says so', () => {
    const text =
      "Our team documents don't cover this. You could ask your onboarding buddy which on-call tool the team uses.";
    expect(parseSources(text)).toEqual({ body: text, sources: [] });
  });

  it('only parses the last line: a Sources line elsewhere stays visible text', () => {
    const text = 'Sources: branch-naming.md\nBut here is more text after it.';
    expect(parseSources(text)).toEqual({ body: text, sources: [] });
  });

  it('does not treat a sentence that merely mentions sources as a Sources line', () => {
    const text = 'The best sources of truth are the docs.';
    expect(parseSources(text).sources).toEqual([]);
    expect(parseSources('Open-source: yes').sources).toEqual([]);
  });

  it('removes an empty Sources line, citing nothing', () => {
    expect(parseSources('Answer.\nSources:')).toEqual({ body: 'Answer.', sources: [] });
  });

  it('handles empty and whitespace-only text', () => {
    expect(parseSources('')).toEqual({ body: '', sources: [] });
    expect(parseSources('\n \n')).toEqual({ body: '\n \n', sources: [] });
  });
});

describe('classifySources (B-07)', () => {
  it('marks a loaded document as known, with its title', () => {
    expect(classifySources(['branch-naming.md'], LOADED)).toEqual([
      { source: 'branch-naming.md', status: 'known', title: 'Branch naming' },
    ]);
  });

  it('keeps an invented name, marked unknown, in its place: never dropped', () => {
    expect(classifySources(['branch-naming.md', 'invented-guide.md'], LOADED)).toEqual([
      { source: 'branch-naming.md', status: 'known', title: 'Branch naming' },
      { source: 'invented-guide.md', status: 'unknown', title: null },
    ]);
  });

  it('matches names exactly: a path, a case change or a near miss is unknown', () => {
    for (const name of [
      'knowledge/branch-naming.md',
      'Branch-Naming.md',
      'branch-naming',
      '../branch-naming.md',
    ])
      expect(classifySources([name], LOADED)[0]?.status, name).toBe('unknown');
  });

  it('marks every name unchecked when the list of documents is unavailable', () => {
    expect(classifySources(['branch-naming.md'], null)).toEqual([
      { source: 'branch-naming.md', status: 'unchecked', title: null },
    ]);
    expect(classifySources(['branch-naming.md'], [])[0]?.status).toBe('unknown');
  });

  it('findKnownSource finds nothing for an inherited property name', () => {
    expect(findKnownSource('constructor', LOADED)).toBeNull();
    expect(findKnownSource('code-review.md', LOADED)).toEqual(LOADED[1]);
  });
});
