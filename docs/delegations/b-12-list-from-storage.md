# Delegation: B-12 "What's on my list?" answered from storage on every engine

Status: approved by the PO on 2026-10-03 (as written).
Delegated to: the `feature-builder` subagent, in one bounded session. This contract **is** the plan.

## Context you need

- `BACKLOG.md`: items **B-12** and **B-11** (B-11 for the existing behavior and its Amendment 1).
- `ARCHITECTURE.md`: the _Decision index_, then ADR-09, ADR-10 and ADR-11.
- `src/shared/llm/todo-phrases.ts` and its test; `server/llm/chat-core.ts`; `server/llm/engines/ollama.ts`, `engines/mock.ts`, `engines/types.ts`; `src/features/chat/hooks/use-chat.ts`; `src/features/todos/index.ts` and the action-card component it exports.
- Pattern for the check: `scripts/verify-todos.mjs`.

## Decisions already made

1. **The list question never needs a model.** On an engine that can't run actions (Ollama, or the mock with `MOCK_TOOLS=off`), a message the shared phrase matcher recognizes as **"list my to-dos"** is answered with a `list` action **without calling the model**. The browser renders it with the same action card Claude's list produces, built from storage.
2. Where the detection lives is your choice (server or client), but the **same shared matcher** decides, and only for the _list_ intent.
3. **Add and complete stay refused** on those engines, with the current honest message (B-11 Amendment 1). Nothing else changes for Claude.
4. Record the design in ADR-11 as a short "B-12 update" paragraph, with a row change in the Decision index if needed.

## Acceptance criteria

- [ ] With `MOCK_TOOLS=off`, "What's on my list?" shows the stored to-dos in the same card as with tools on, and **the engine isn't called**. Evidence: a unit test proving the engine function was never invoked, plus a new `verify:todos` scenario with `MOCK_TOOLS=off` that **reads storage directly** and compares it with the card.
- [ ] With `MOCK_TOOLS=off`, "remind me to …" and "mark … as done" are still refused, with nothing stored. Evidence: test plus `verify:todos`.
- [ ] An empty list answers with the empty-list card, not a model reply. Evidence: test.
- [ ] Claude's path is unchanged. Evidence: existing tests pass; `npm run verify:todos` (tools on) passes.
- [ ] No regression: `npm run -s check`, `npm run verify:todos`, `npm run verify:persistence -- <tmp dir>`.

## Limits

- No new dependencies. Don't modify `.claude/`, `CLAUDE.md`, the context files, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `netlify.toml`.
- A stored-shape change needs a snapshot version bump and a tested migration (CLAUDE.md). Avoid it if you can.
- Never run anything with `--debug` or `DEBUG`, never print environment variables, never start a server in the background.
- One commit per step; set B-12 to `done` with `docs/evidence/b-12-verification.md`.

## How you deliver

Commits with hashes; each criterion with its evidence; **"Decisions I made that this contract didn't cover"**; the final `check` result.
