<!-- Verbatim reply of a read-only Claude Code session asked for a B-06 architecture on 2026-10-01; reviewed in ARCHITECTURE.md, ADR-12. -->

# B-06 architecture proposal: onboarding knowledge base

## 1) Approach

On every request, the server reads every Markdown file in `knowledge/` and adds them to the system prompt, each wrapped in a labelled `<document source="…">` block. There is no retrieval step: a 15-person team's convention docs are small enough to send whole, and file-level labels set up B-07's citations.

## 2) Components and where each lives

| Component                                                 | Location                            | Role                                                                                                                             |
| --------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/*.md`                                          | repo root                           | Team docs, committed like any other content                                                                                      |
| `loadKnowledge(dir)`                                      | `server/knowledge/load.ts`          | Reads files with `node:fs/promises`. Returns `{ documents, skipped }`. Skips files over 50 KB and logs them with `console.warn`. |
| `buildSystemPrompt(base, documents)`                      | `server/knowledge/system-prompt.ts` | A pure function that appends the document blocks to `SYSTEM_PROMPT`                                                              |
| Handler option `knowledge: () => Promise<KnowledgeDoc[]>` | `server/llm/handler.ts`             | Injected the same way `env` is today, so tests pass fixtures without touching the disk                                           |
| Wiring                                                    | `server/llm/vite-plugin.ts`         | Points the loader at `<root>/knowledge`                                                                                          |
| Limits                                                    | `LLM_CONFIG`                        | `maxKnowledgeFileBytes` (50 KB) and a total `knowledgeChars` budget                                                              |

Nothing changes in the browser.

## 3) Data flow for one question

1. The browser POSTs `{ messages }` to `/api/chat`, unchanged.
2. The handler parses and trims the history, then calls `knowledge()`. The loader lists `knowledge/*.md`, skips oversized files with a warning, and reads the rest.
3. `buildSystemPrompt` returns the base prompt plus `<document source="branch-naming.md">…</document>` for each file.
4. `engine.stream({ system, messages, signal })` runs. The `system` slot already exists at `handler.ts:83`, so the engine interface doesn't change.
5. The NDJSON stream is unchanged: `start`, `delta`…, then `done`.

## 4) New dependencies

None. `node:fs/promises` and `node:path` are enough. I'm not adding a front-matter parser, an embeddings library or a vector store.

## 5) How it fits or changes existing ADRs

- **ADR-03:** fits. The engine interface and key handling stay the same. The docs go to the provider like any other prompt text.
- **ADR-08:** fits. The new code lives in `server/` with `.ts` imports, and the handler still depends only on `node:http`.
- **ADR-09:** the protocol is unchanged. A missing `knowledge/` folder means an empty knowledge base, not an error. A read failure maps to the existing `unknown` code, so there are still 13 codes.
- **New ADR-11:** "The knowledge base is loaded whole into the system prompt, server-side, on every request, with no retrieval." It also records the size budgets.

## 6) Risks and what I'd measure

- **Context overflow (main risk).** The 50 KB limit is per file, so ten files could add up to about 125k tokens. Ollama's default context is small, and Ollama truncates long prompts without saying so, which can cut off the system prompt. I'd measure prompt size per request (server log: files, bytes, estimated tokens) and Ollama's `prompt_eval_count` against what we sent.
- **Latency and cost.** Sending every document on every turn costs time and money. I'd measure time to first token with and without the knowledge base, per engine. Anthropic prompt caching on the system block would help, but that's a later change to the adapter.
- **Evidence for criterion 2.** The mock engine can't actually answer a question. A deterministic test can prove that the file content reaches `system`. Proving that the model gives the right answer needs a live check against a fixture `knowledge/`, and its result goes in `docs/evidence/`. Whether you accept a live, non-deterministic run as evidence for criterion 2 is your call.
- **Data exposure.** Everything in `knowledge/` goes to the provider. Someone could commit a secret into a convention doc without noticing.

## 7) Alternative I considered and rejected

**Retrieval-augmented generation (RAG):** split the docs into chunks, embed them, and send only the top-k chunks. I rejected it for now:

- It needs new dependencies and an embedding model for each engine.
- It adds non-determinism that's hard to test.
- Chunks make B-07's per-file citations more complicated.
- It solves a scale problem we don't have.

If we hit the total budget, the next step would be simple keyword retrieval, recorded in a new ADR, not embeddings.

## Questions for you

1. **Where the warning goes.** "A warning in the console" could mean the server terminal or the browser console. The loader runs on the server, so I'd log it there. Showing it in the browser would need a new stream event.
2. **Total size budget.** Should there be a cap on all documents together, and what should happen when it's exceeded: skip the remaining files with a warning, or fail the request?

I haven't written or changed any files. The next step would be the plan in `docs/plans/B-06-knowledge-base.md`, once you approve this direction.
