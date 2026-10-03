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
