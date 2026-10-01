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

## Plan

Written by the `feature-builder` subagent before the first code change. One commit per step, each after `npm run format` and `npm run -s check`.

| #   | Step                                                                                                                                                                                                                                                                   | Files                                                                                                             | Criteria                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | Protocol: the `action` event and `TodoAction` type, open to-dos in the request; the client sends them and reports actions. ADR-11 (proposed) + index row                                                                                                               | `src/shared/llm/protocol.ts`, `client.ts`, tests, `ARCHITECTURE.md`                                               | Engines, The model never claims success         |
| 2   | Server: engines may yield actions; the handler forwards them and passes the to-dos; the mock maps the four phrases; the system prompt forbids claiming list changes                                                                                                    | `server/llm/engines/types.ts`, `mock.ts`, `handler.ts`, `history.ts`, `system-prompt.ts`, tests                   | Add, List, Complete, Engines (mock, Ollama)     |
| 3   | Anthropic: declare the three tools with the open to-dos in the system prompt, turn a `tool_use` into an action                                                                                                                                                         | `server/llm/todo-tools.ts`, `engines/anthropic.ts`, tests                                                         | Engines (Anthropic)                             |
| 4   | To-do feature: model (add, match, complete, list order), versioned snapshot, synchronous never-throwing store, an executor that writes then reads back and builds the card, the card component and CSS (pending → settled, no motion under reduced motion), `index.ts` | `src/features/todos/**`                                                                                           | Add, List, Complete, Honest failure, In-between |
| 5   | Chat: `Message.action`, snapshot version 2 with a tested migration from 1, model text replaced by the card, history includes the card for the model, `useChat` runs the action after the stream ends, `ReplyBody` renders the card                                     | `src/features/chat/model/*`, `api/conversation-store.ts`, `hooks/use-chat.ts`, `components/reply-body.tsx`, tests | All except Evidence                             |
| 6   | `npm run verify:todos`: headless Chrome, mock engine, reads storage through DevTools, restarts the browser; evidence file; backlog status                                                                                                                              | `scripts/verify-todos.mjs`, `package.json`, `docs/evidence/b-11-verification.md`, `BACKLOG.md`                    | Evidence, Survives a restart                    |

## How you deliver

Commit as you go. Your final report must contain:

1. **A diff summary:** commits with hashes, and the files touched per commit.
2. **Each criterion:** met or not met, with the evidence (test names, or the `verify:todos` result).
3. **Decisions I made that this contract didn't cover**, each in one line. Leave none out, even small ones.
4. **Anything you'd change in an existing ADR** (don't change it; just say it).
5. **The final `npm run -s check` result.**

## Amendment 1 (after pass 1, approved by the PO on 2026-10-01)

### Why

The PO's independent verification passed every check: check 226, verify:todos 12/12 mock and 8/8 live, and the regression suites. Then it found one criterion failing in practice. With `INFERENCE_ENGINE=ollama` (`phi3`), "Remind me to ask Ana how deploys work." got the reply _"Okay, I've set a reminder for you to ask Ana about deployments"_, and **nothing was stored**. The system-prompt mitigation doesn't hold for a small local model. The PO also overrules two decisions from pass 1's "Decisions I made" list.

### Corrected behavior (all three are acceptance criteria for this pass)

1. **Engines that can't run actions.** While the active engine has no tool calling (Ollama today):
   - The chat shows a **standing app notice**: Compass can't change the to-do list with the current engine, and saved to-dos are safe.
   - A message that matches the known to-do phrases ("remind me to …", "add … to my list", "what's on my list", "mark … as done") **is not answered by the model**. The app replies with a message that says the action wasn't performed and why. **Nothing stored changes.**
   - Other wording still reaches the model, as today.
   - The notice disappears when the engine can run actions.
2. **Unreadable to-do data.** It's removed, as now, but the chat **says so once** ("Your saved to-do list couldn't be read, so it was reset"), the same way B-08 handles an unreadable conversation.
3. **Several actions in one reply.** Every action the model requests runs **in order, each with its own card** (success or failure). None is dropped silently. Parallel tool use may be enabled.

### Evidence required

- **Unit tests** for each corrected behavior.
- **`verify:todos` scenarios.** The mock gains a way to behave as an engine without tool calling, e.g. `MOCK_TOOLS=off`. If it's an environment variable, add it to `.env.example`. Scenarios:
  - (a) the standing notice is shown, and a to-do phrase gets the app message with storage byte-identical;
  - (b) corrupted to-do data gives the reset notice once;
  - (c) two actions in one mock reply give two cards and both changes in storage.
- **One live run with Ollama (`phi3`)**, recorded in `docs/evidence/b-11-verification.md`: the add phrase gives the app message, storage is unchanged, and the notice is visible. Allow for CPU slowness (about 20 s per reply).

### Limits for this pass

The same as above, plus:

- `server/llm/**` may change to report whether an engine can run actions.
- The mock may gain the no-tools mode.
- `.env.example` may gain one variable.
- Don't touch existing ADRs; amend ADR-11 (still "Proposed") if your design changes.

### Delivery

The same report format as pass 1, including a fresh "Decisions I made that this contract didn't cover" for this pass.
