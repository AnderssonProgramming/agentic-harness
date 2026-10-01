# Delegation: B-11 onboarding to-do list

Status: approved by the PO on 2026-10-01 (as written).
Delegated to: the `feature-builder` subagent (`.claude/agents/feature-builder.md`), in one bounded session.
Once approved, this contract **is** the plan (CLAUDE.md, "Delegation contracts").

## Context you need

Read only these. If you need something else, say why in your report.

- `BACKLOG.md`: item **B-11** only (`Grep "\[B-11\]" -A 30 BACKLOG.md`).
- `ARCHITECTURE.md`: the _Decision index_, then ADR-01, ADR-03, ADR-07, ADR-09 and ADR-10.
- `CONTEXT-ROUTINE.md`: "During the task", "Signals to compact or restart", and the headless rule (foreground checks).
- **Server:** `server/llm/engines/types.ts`, `engines/anthropic.ts`, `engines/mock.ts`, `handler.ts`, `history.ts`.
- **Shared:** `src/shared/llm/protocol.ts`, `client.ts`.
- **Chat:** `src/features/chat/hooks/use-chat.ts`, `model/message.ts`, `model/conversation-snapshot.ts`, `api/conversation-store.ts`, `components/message-list.tsx`, `components/reply-body.tsx`.
- **Browser checks** (pattern to copy): `scripts/verify-persistence.mjs`, `scripts/lib/chrome.mjs`.

## Decisions already made (not up for discussion)

1. **The model recognizes the intent, through tool calling.**
   - The server declares three tools: add a to-do, list to-dos, complete a to-do.
   - The Anthropic engine turns a `tool_use` into a new protocol event.
   - The **mock** engine emits the same events deterministically from plain phrases, for tests: "remind me to …", "add … to my list", "what's on my list", "mark … as done".
   - The **Ollama** engine declares no tools and answers in plain text.
2. **Execution happens in the browser, on persisted data.**
   - To-dos live in a new feature, `src/features/todos/` (ADR-01).
   - Its own `api/` store follows the ADR-10 pattern: a versioned snapshot, synchronous, never throws, typed results.
   - The chat uses the to-do feature only through its `index.ts`.
3. **The app confirms, not the model.**
   - Each action becomes an _action card_ in the conversation. It's built from the store's result after the write, and is persisted with the conversation.
   - That changes the stored conversation shape, so, per CLAUDE.md, it **bumps the snapshot version and adds a tested migration** from version 1.
4. **The model sees the open to-dos.** The browser sends the current to-dos (id and text) with each request, so "mark the deploy one as done" can name an id. "What's on my list?" is still **answered by the app from storage**, never by the model's text.
5. **The ADR-09 protocol may gain exactly one new event type** for actions. Record it, with the rest of your design, as **ADR-11 with status "Proposed by the agent, pending PO review"**, plus a row in the decision index. The PO accepts, corrects or rejects it after delivery.

## What to build

Saying "remind me…", "what's on my list?" or "mark … as done" in the chat performs that action on the stored to-do list and shows an app-generated confirmation that survives a browser restart. Ordinary questions keep working as before.

## Acceptance criteria

All ten criteria of **B-11** in BACKLOG.md. Report each one with its evidence (test names, or `verify:*` output):

- [ ] Add
- [ ] List
- [ ] Complete (including "no match" and "ambiguous": nothing changes, it asks)
- [ ] Honest failure (blocked or full storage: nothing applied, no false confirmation)
- [ ] The model never claims success itself
- [ ] In-between states (pending → success or failure; no motion under reduced motion)
- [ ] Survives a restart (to-dos and cards)
- [ ] Doesn't break the chat (ordinary replies, and context after an action)
- [ ] Engines (Anthropic live, mock deterministic, Ollama plain text with no false confirmation)
- [ ] Evidence: unit tests, plus `npm run verify:todos`, a browser check that **reads storage directly** and restarts the browser

## Limits

- **No new dependencies.** If you think one is needed, stop and say why.
- **Don't modify:**
  - `.claude/`, `CLAUDE.md`, `CONTEXT-ROUTINE.md`, `CONTEXT-LOG.md`
  - `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`
  - existing ADRs. Add ADR-11 only. If you think an existing ADR is wrong, say so in the report.
- In `package.json`, only add the `verify:todos` script.
- `server/llm/**` and `src/shared/llm/**` may change **only** to add the tools and the action event.
- **Don't decide product questions.** No due dates, priorities, editing or deleting to-dos, a separate to-do screen, or wording beyond the criteria. If a criterion needs a product choice, take the simplest reading and list it under "Decisions I made".
- Follow CLAUDE.md:
  - one commit per step, with `npm run format` and `npm run -s check` first
  - the self-correction loop for defects
  - foreground checks (headless session)
- **Stop and report** instead of continuing if a criterion can't be met within these limits.

## How you deliver

Commit as you go. Your final report must contain:

1. **A diff summary:** commits with hashes, and the files touched per commit.
2. **Each criterion:** met or not met, with the evidence (test names, or the `verify:todos` result).
3. **Decisions I made that this contract didn't cover**, each in one line. Leave none out, even small ones.
4. **Anything you'd change in an existing ADR** (don't change it; just say it).
5. **The final `npm run -s check` result.**
