# Delegation: B-10 starter questions

Status: approved by the PO on 2026-10-03 (as written).
Delegated to: the `feature-builder` subagent, in one bounded session. This contract **is** the plan.

## Context you need

Read only these:

- `BACKLOG.md`: item **B-10** only (`Grep "\[B-10\]" -A 14 BACKLOG.md`).
- `ARCHITECTURE.md`: the _Decision index_, then ADR-01 and ADR-04.
- `src/features/chat/components/chat-screen.tsx`, `message-list.tsx`, `composer.tsx` and their tests; `src/features/chat/hooks/use-chat.ts` (only the part that sends a message); `src/features/chat/chat.css` if it exists.
- Pattern for the browser check: `scripts/verify-chat.mjs`.

## Decisions already made

1. **The suggestions are exactly these four, in this order** (they match the team documents B-06 will load):
   - "What is our branch naming convention?"
   - "How do deploys work here?"
   - "What should I do in my first week?"
   - "What does a code review need before I ask for one?"
2. A new presentational component in `src/features/chat/components/`, with props only (ADR-04). Clicking a suggestion sends it through **the same path** as typing it and pressing Enter, including the same validation (CLAUDE.md: "a disabled control is never the only guard"). While a reply is streaming, suggestions aren't shown anyway, because the conversation isn't empty.
3. Suggestions are buttons: keyboard reachable, with a visible focus style, no motion under `prefers-reduced-motion`.
4. Suggestions show in **an empty conversation**, including after "New conversation". They're never stored in the snapshot (no storage shape change).

## Acceptance criteria

- [ ] An empty conversation shows the 4 suggestions (B-10: 3 to 5). Evidence: component test, plus `verify:chat`.
- [ ] Clicking one sends it as a user message, and a reply streams. Evidence: test, plus a new `verify:chat` step that clicks one on the mock engine.
- [ ] Suggestions disappear once there's at least one message, and come back after "New conversation". Evidence: test.
- [ ] No regression: `npm run -s check`, `npm run verify:chat -- <tmp dir>`, `npm run verify:persistence -- <tmp dir>`.

## Limits

- No new dependencies. Don't modify `.claude/`, `CLAUDE.md`, the context files, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `netlify.toml`, ADRs other than adding one if you make a design decision.
- Never run anything with `--debug` or `DEBUG`, never print environment variables, never start a server in the background.
- Verification scripts write screenshots to a temp folder. **Create the folder first:** `verify:chat` doesn't (TECH-DEBT D-05).
- One commit per step; update B-10's `Status:` to `done` and add `docs/evidence/b-10-verification.md` at the end.

## Plan

Written by the `feature-builder` subagent on 2026-10-03.

| Step | What                                                                                                                                                                                                                  | Files                                                                                 | Criteria |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| 1    | This plan                                                                                                                                                                                                             | this file                                                                             | —        |
| 2    | The four questions as data in `model/`; presentational `StarterQuestions` (buttons, `onPick`, re-checks `checkDraft`); focus style, no motion under reduced motion; component tests                                   | `model/starter-questions.ts`, `components/starter-questions.tsx` (+ test), `chat.css` | 1, 2     |
| 3    | Show them in `MessageList`'s empty state; `ChatScreen` passes `send` (same path as Enter) and returns focus to the composer; screen tests: click → message + streamed reply, hide, come back after "New conversation" | `message-list.tsx` (+ test), `composer.tsx`, `chat-screen.tsx` (+ test)               | 1, 2, 3  |
| 4    | `verify:chat`: count the 4 suggestions in the empty state; after "New conversation", click one on the mock engine and watch the reply stream                                                                          | `scripts/verify-chat.mjs`                                                             | 1, 2     |
| 5    | Run `check`, `verify:chat`, `verify:persistence` into a temp folder; evidence file; B-10 `done`                                                                                                                       | `docs/evidence/b-10-verification.md`, `BACKLOG.md`                                    | 4        |

## How you deliver

Commits with hashes; each criterion with its evidence; **"Decisions I made that this contract didn't cover"**; the final `check` result.
