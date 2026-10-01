# B-11 verification: onboarding to-do list

Date: 2026-10-01. Chrome/154.0.8037.58, headless. Delivered by the `feature-builder` subagent under `docs/delegations/b-11-todo-list.md`. The design is ADR-11 (proposed, pending PO review).

`verify:todos` reads storage through the DevTools protocol (`DOMStorage.getDOMStorageItems`), not through the page. A page that blocks or breaks `localStorage` can't fake what it reads. It restarts Chrome on the same profile with a graceful close, so storage is flushed to disk.

## `npm run verify:todos` (mock engine, deterministic): 12 of 12 pass

| Criterion                             | Check                                                                                                            | Result                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| List                                  | An empty list says it's empty                                                                                    | "Your list is empty."; stored: null                                                                       |
| Add                                   | "Remind me to ask Ana how deploys work" stores an open to-do; the card is built from the stored item             | stored `ask Ana how deploys work`, `done: false`; card "Added to your list: ask Ana how deploys work"     |
| Complete                              | "Mark the deploy one as done": that stored to-do becomes done, the other is untouched, the card names it         | stored `[ask Ana…, true]`, `[read the onboarding doc, false]`; "Marked as done: ask Ana how deploys work" |
| List                                  | The card shows exactly the stored to-dos, open first, done marked, with the stored count                         | "Your list has 2 to-dos, 1 open:", items in stored order                                                  |
| Complete (ambiguous, no match)        | Two "deploy" to-dos, or "the coffee one": storage byte-identical, Compass asks which one                         | 2 candidates; "No open to-do matches “the coffee one”. Which one do you mean?"; unchanged: true           |
| The model never claims success itself | Every reply with an action shows only the app card, no model text                                                | 9 cards; 0 with model text                                                                                |
| Doesn't break the chat                | An ordinary question afterwards gets an ordinary reply, and the model received every earlier turn                | "I have received 10 of your messages"                                                                     |
| In-between states                     | Pending card, then the same element turns into success; transition normally, none under `prefers-reduced-motion` | "Updating your list…" → "Added to your list: ask Bo about tests"; `0.2s, 0.2s` → `0s`                     |
| Survives a restart                    | After closing and reopening Chrome: stored to-dos identical, cards identical on screen and in storage            | 5 to-dos; 10 cards on screen, 10 in the stored conversation (version 2)                                   |
| Honest failure (full)                 | Nothing stored, failure card, no "Added" card, chat still answers                                                | "Couldn't save to your list: your browser's storage is full. Nothing was changed."; stored: null          |
| Honest failure (blocked)              | Same, with storage blocked                                                                                       | "Couldn't save to your list: your browser is blocking storage. Nothing was changed."; stored: null        |
| —                                     | No console errors or exceptions                                                                                  | none                                                                                                      |

## `npm run verify:todos -- --live` (engine in `.env`: Anthropic): 8 of 8 pass

The live mode runs only the deterministic parts of the flow. The ambiguous case, failures and the pending state depend on the mock and run in mock mode only.

| Criterion                             | Result                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| List (empty)                          | "Your list is empty."; stored: null                                                                                       |
| Add                                   | stored `Ask Ana how deploys work` (the model's wording); card "Added to your list: Ask Ana how deploys work"              |
| Complete                              | stored `[Ask Ana how deploys work, true]`, `[Read the onboarding doc, false]`; "Marked as done: Ask Ana how deploys work" |
| List                                  | "Your list has 2 to-dos, 1 open:", matching storage                                                                       |
| The model never claims success itself | 5 cards (listed, added, added, completed, listed), none with model text                                                   |
| Doesn't break the chat                | "Who did I want to ask about deploys?" → "Ana — you wanted to ask her how deploys work."                                  |
| Survives a restart                    | 5 cards and the stored to-dos unchanged after a restart                                                                   |
| —                                     | No console errors                                                                                                         |

The first live run failed one check because the script required the mock's exact lowercase wording. Claude had stored "Ask Ana how deploys work". The criterion asks for "a to-do with that meaning", so live mode now checks for "Ana" and "deploy". The card must still equal the stored text exactly.

## Unit tests (`npm test`)

- Intent mapping: `mockIntent (B-11)` in `server/llm/engines/engines.test.ts` (8 phrases mapped, 4 ordinary messages left alone). Anthropic: `declares the three to-do tools…`, `turns a streamed tool_use into one action…`, `maps add_todo / list_todos…`, `reports "malformed" for a tool call with bad input…`.
- Ollama: `ollamaEngine and to-dos (B-11)`: no `tools` in the request, no to-dos sent, only text yielded.
- Protocol and server: `isTodoAction (B-11)` (`src/shared/llm/protocol.test.ts`), `sends the open to-dos and reports an action event`, handler `forwards a to-do action as an action event…`, `passes the open to-dos to the engine, and rejects invalid ones`.
- Execution and failure: `to-do actions (B-11)` in `src/features/todos/api/todo-actions.test.ts`. Covered: add, list, complete, no match and ambiguous (storage unchanged), full, blocked, and a write that storage silently dropped (`not-saved`).
- Store and snapshot: `to-do store (B-11)`, `to-do snapshot (B-11)`.
- Chat: `to-do action lifecycle (B-11)` (`message.test.ts`) and `to-do actions (B-11)` (`use-chat.test.ts`). They cover: model text dropped, pending → settled, only the first action, no action run on failure or stop, the card as context for the next turn, ordinary replies unchanged.
- Migration: `migrates version 1 (B-08) to version 2 by giving every message no action (B-11)` and `round-trips a settled to-do card and drops one still pending after a restart`.
- Card: `TodoActionCard (B-11)`, MessageList `shows the app's to-do card…`.

## Regressions

`npm run verify:chat` (19 of 19), `verify:persistence` (8 of 8) and `verify:llm` (10 of 10, including the live Anthropic call with the tools declared and the bundle secrets check) all pass after the change.
