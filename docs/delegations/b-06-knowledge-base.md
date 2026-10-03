# Delegation: B-06 onboarding knowledge base

Status: approved by the PO on 2026-10-03 (as written).
Delegated to: the `feature-builder` subagent, in one bounded session. This contract **is** the plan.

## Context you need

- `BACKLOG.md`: item **B-06** only.
- `ARCHITECTURE.md`: the _Decision index_, then **ADR-12 in full** (the design, accepted with corrections), ADR-03, ADR-08 and ADR-13.
- `server/llm/system-prompt.ts`, `chat-core.ts`, `config.ts`, `handler.ts`, `web-handler.ts`, `vite-plugin.ts`; `netlify/functions/chat.ts`; `server/llm/prompt-invariants.test.ts` (the invariant pattern); `knowledge/*.md` (the PO's four documents; don't edit them).
- `scripts/verify-prod.mjs` (to add one check).

## Decisions already made (ADR-12, plus these)

1. **ADR-12 as accepted:**
   - read `knowledge/*.md` in alphabetical order, each as a `<document source="file.md">` block in the system prompt;
   - files over **50 KB** are skipped with a server-console warning;
   - a **total budget** of 40,000 characters for Anthropic and **8,000 for Ollama**: whatever doesn't fit is skipped and listed in the warning;
   - a **secrets guard**: a file that matches `sk-ant-`, `-----BEGIN … PRIVATE KEY` or an `api_key=`-style assignment is skipped, never sent, and named in the warning.

   The request never fails because of the knowledge base.

2. **The knowledge is loaded once per server start** (or per Function cold start), not per request, and injected like `env` so tests can pass a fake set.
3. **Production:** add `included_files = ["knowledge/**"]` under `[functions]` in `netlify.toml` (allowed by CLAUDE.md's exception through this contract), and resolve the folder so it works locally, under `netlify serve`, and on Netlify.
4. **The knowledge counts toward ADR-12's budget and the existing prompt-additions invariant** (`MAX_PROMPT_ADDITIONS`). Extend the property test so "what reaches the model is bounded" still holds with any knowledge set.
5. **verify:prod gains one check:** `knowledge-branch-naming`. Ask "What is our branch naming convention?" and pass if the reply contains `<type>/<item-id>-<short-slug>` or `feat/b-06` (strings only the PO's document contains).

## Acceptance criteria

- [ ] Markdown files in `knowledge/` reach the system prompt with each request. Evidence: deterministic test that the content is in `system`.
- [ ] "What is our branch naming convention?" returns the answer from `knowledge/`. Evidence: a **live** Anthropic run recorded in `docs/evidence/b-06-verification.md` (one request), plus the new verify:prod check passing against `npm run verify:prod:local`'s server **with a mock that echoes the system prompt's knowledge**, or, if that's impractical, against the live run only. Say which.
- [ ] Files over 50 KB are skipped and listed in a server-console warning. Evidence: test with a fake large file.
- [ ] The total budget per engine holds, alphabetical order decides, and skipped files are listed. Evidence: tests for Anthropic and Ollama sizes.
- [ ] A file containing a key pattern is never sent, and is named in the warning. Evidence: test with fake key fixtures. **Never use a real key.**
- [ ] The prompt-additions invariant still holds with knowledge included. Evidence: the extended property test.
- [ ] No regression: `npm run -s check`, `npm run verify:llm`, `npm run verify:prod:local`.

## Limits

- No new dependencies. Don't modify `.claude/`, `CLAUDE.md`, the context files, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, or `knowledge/*.md`. `netlify.toml` only for decision 3.
- Never run anything with `--debug` or `DEBUG`, never print environment variables or the system prompt in logs, never start a server in the background. Don't read `.env`.
- Size: if this grows past about 6 steps, finish the current step, commit, and hand off.
- One commit per step; ADR-12's status becomes "Accepted with corrections, built (B-06)"; set B-06 to `done` with the evidence file.

## How you deliver

Commits with hashes; each criterion with its evidence; **"Decisions I made that this contract didn't cover"**; the final `check` result.

## Amendment 1 (after the first pass stopped, approved on 2026-10-03)

The first pass stopped before writing code, correctly. Decisions 1 and 4 contradicted each other: ADR-12's 40,000-character Anthropic budget can't fit under the existing `MAX_PROMPT_ADDITIONS` of 16,000, which a full to-do list nearly fills. Options B (shrink knowledge to ~1,600 characters) and C (drop documents per request, depending on the user's to-do count, without telling the user) were rejected: C is a silent drop, and B defeats B-06.

**Decision A replaces Decision 4:**

1. **The bound becomes per engine:** prompt additions ≤ `MAX_PROMPT_ADDITIONS` (16,000: to-dos, instructions, tool definitions; unchanged) **+ that engine's knowledge budget** (40,000 Anthropic; 8,000 Ollama and the mock). Put the per-engine knowledge budget in one place and derive the bound from it.
2. **The knowledge is filled only up to its own budget,** by the loader, in alphabetical order (ADR-12). So the knowledge alone can never push a request over the bound, and the existing `bad_request` path stays reachable only by oversized to-dos or instructions, as today.
3. **The property test proves the new invariant:** for any request shape and sequence, and any knowledge set (including oversized, many-file and key-containing sets), what reaches the model is ≤ the engine's bound, and every loaded document is either fully included or skipped and listed. None is truncated mid-file.
4. Record in ADR-12's update that LLM-05's bound is now per engine, and why. The next audit re-checks LLM-05 against it.

Everything else in the contract stands. Commit this amendment's plan as your first step.

## Plan

Written by the `feature-builder` subagent, second pass (under Amendment 1).

| #   | Step                                                                                                                                                                                                                                                                                                                                 | Files                                                                                                                                                     | Criteria       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | This plan.                                                                                                                                                                                                                                                                                                                           | this file                                                                                                                                                 | —              |
| 2   | Knowledge loader: per-engine budget in `LLM_CONFIG` (the one place), `maxPromptAdditions(engine)` derived from it; a pure `buildKnowledge(files)` (alphabetical, 50 KB skip, secrets guard, first-fit per engine budget, whole documents only, one warning naming every skipped file) and `loadKnowledge(dir)` over the file system. | `server/llm/config.ts`, `server/llm/knowledge.ts`, `server/llm/knowledge.test.ts`                                                                         | 3, 4, 5        |
| 3   | Wire it in: `ChatCoreOptions.knowledge`, `system = SYSTEM_PROMPT + knowledge for the engine`; loaded once in the Vite plugin and the two Functions; system prompt no longer says documents aren't connected; `included_files` in `netlify.toml`. Deterministic test that the content is in `system`.                                 | `server/llm/chat-core.ts`, `system-prompt.ts`, `vite-plugin.ts`, `netlify/functions/*.ts`, `netlify.toml`, `server/llm/chat-core.test.ts` (or a new test) | 1              |
| 4   | Extend the property test: random knowledge sets (oversized, many files, key-containing) × request shapes × engines; total ≤ the engine's bound, every document whole or skipped and listed.                                                                                                                                          | `server/llm/prompt-invariants.test.ts`                                                                                                                    | 6              |
| 5   | The mock echoes the knowledge a question names; `knowledge-branch-naming` in verify:prod; a one-request live script `verify:knowledge`; run verify:prod:local, verify:llm, the live Anthropic run.                                                                                                                                   | `server/llm/engines/mock.ts`, `scripts/verify-prod.mjs`, `scripts/verify-knowledge.mjs`, `package.json`                                                   | 2, 7           |
| 6   | Evidence and docs: `docs/evidence/b-06-verification.md`, ADR-12 update (built; LLM-05's bound per engine), decision index, B-06 `done`, CLAUDE.md is not touched.                                                                                                                                                                    | `docs/evidence/b-06-verification.md`, `ARCHITECTURE.md`, `BACKLOG.md`                                                                                     | all (evidence) |
