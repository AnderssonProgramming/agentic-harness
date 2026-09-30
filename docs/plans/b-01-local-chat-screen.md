# Plan: B-01 Local chat screen (+ B-02 composer basics)

Status: done. Approved by the Product Owner on 2026-09-30 (as written; test dependencies authorized) and executed as 11 steps; evidence in `docs/evidence/b-01-verification.md`.
Sources read: `CLAUDE.md`, `BACKLOG.md` (B-01, B-02), `ARCHITECTURE.md` (ADR-01 to ADR-03).

## Scope

- In: B-01 in full. From B-02: empty messages blocked, input cleared and focused after sending, `Enter` / `Shift+Enter`, and the 4,000-character limit, because the week-2 track criteria ask for them and they live in the same component.
- Out: any network or model call (Sprint 1 rule), `localStorage` (that's B-08), starter questions (B-10).
- Assistant messages: since nothing calls a model yet, each user message gets a fixed local assistant reply ("I can't answer yet: my model connection arrives with B-03."). That makes the "mine vs assistant" criterion testable without breaking the Sprint 1 rule.

## Refinement proposed before starting

B-01 has no empty-state criterion, but the week-2 guide lists it as a typical gap. Proposed new criterion:

- With no messages, the list shows a short explanation of what Compass is and what to type, instead of a blank area.

## Steps (one commit each, shown to the PO before the next one)

| #   | Step                                                                                                                                                  | Files                                                                                           | Criteria covered     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Add the empty-state criterion to B-01 and set B-01 to `in progress`                                                                                   | `BACKLOG.md`                                                                                    | —                    |
| 2   | Add the test tooling (needs approval, see below) and an `npm test` script                                                                             | `package.json`, `vite.config.ts`, `CLAUDE.md` (approved list)                                   | —                    |
| 3   | Message model: `Message` type and pure functions `createMessage`, `appendExchange`, `validateDraft`, with unit tests                                  | `src/features/chat/model/message.ts`, `message.test.ts`                                         | B-01 #1, B-02 #2, #4 |
| 4   | `useChat` hook: messages in `useState` memory, `send(text)` appends the user message plus the local assistant reply                                   | `src/features/chat/hooks/use-chat.ts`, test                                                     | B-01 #1, #4          |
| 5   | `MessageList` component: data via props, user bubbles right/accent, assistant bubbles left/neutral, empty state                                       | `src/features/chat/components/message-list.tsx`, test                                           | B-01 #2, empty state |
| 6   | `useAutoScroll` hook: scrolls the list to the newest message whenever the message count changes                                                       | `src/features/chat/hooks/use-auto-scroll.ts`                                                    | B-01 #3              |
| 7   | `Composer` component: textarea + Send button; `Enter` sends, `Shift+Enter` new line, disabled when empty, counter and block over 4,000, clear + focus | `src/features/chat/components/composer.tsx`, test                                               | B-02 #1–#4           |
| 8   | `ChatScreen` wires hook + components; `App` renders it                                                                                                | `src/features/chat/components/chat-screen.tsx`, `src/features/chat/index.ts`, `src/app/app.tsx` | all                  |
| 9   | Styles for the chat layout (list scrolls, composer fixed at the bottom), light and dark                                                               | `src/features/chat/chat.css`                                                                    | B-01 #2              |
| 10  | Verify in the real browser: send flow, scroll, and the 50-message render time (< 100 ms); record the results                                          | `docs/evidence/b-01-verification.md`                                                            | B-01 #5, all         |
| 11  | ADR-04 (state in a feature hook, no state library) and ADR-05 (local assistant placeholder); B-01 and B-02 to `done`                                  | `ARCHITECTURE.md`, `BACKLOG.md`                                                                 | —                    |

Every step ends with `npm run check` (and `npm test` once it exists) passing.

## Dependencies that need approval

None of these are in "Approved dependencies" today. They're dev-only, to prove the criteria with tests instead of by eye:

- `vitest` (test runner that reuses our Vite config)
- `jsdom` (browser DOM for tests)
- `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` (render components and simulate typing like a user)

If they're not approved, step 2 is removed and verification is manual in the browser only (step 10).

## Standards checklist

- Components get data and callbacks through props only; state and effects live in `hooks/` (CLAUDE.md, ADR-01).
- No `any`, no classes, named exports, kebab-case files.
- No network calls, no `localStorage`, no new runtime dependencies.
