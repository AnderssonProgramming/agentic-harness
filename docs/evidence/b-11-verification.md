# B-11 verification: onboarding to-do list

Date: 2026-10-01. Chrome/154.0.8037.58, headless (pass 1; Amendment 1 results at the end). Delivered by the `feature-builder` subagent under `docs/delegations/b-11-todo-list.md`. The design is ADR-11 (proposed, pending PO review).

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

## Amendment 1 (2026-10-01, Chrome/154.0.8037.93)

The PO found that `phi3` on Ollama answered "Remind me to ask Ana how deploys work." with "Okay, I've set a reminder…" and stored nothing. ADR-11 is amended (still proposed). Engines now declare whether they can run actions. To-do phrases never reach an engine that can't, and the app refuses them itself. Unreadable to-do data is announced once. Every action in a reply runs in order, each with its own card. The conversation snapshot is now version 3.

The tables above are from pass 1. The current numbers are below.

### `npm run verify:todos` (mock): 19 of 19 pass

The 12 pass-1 checks still pass. "Survives a restart" now reads version 3, and the stored cards are counted across `actions` lists. The new checks:

| Scenario                     | Check                                                                                                                                                  | Result                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Engine with actions          | No engine notice at start                                                                                                                              | `{"text":"","shown":false}`                                                                                                    |
| (c) Several actions          | "Remind me to read the deploy guide. Remind me to pair with Bo on tests." → two cards in order, both to-dos stored, both cards stored on the one reply | "Added to your list: read the deploy guide \| Added to your list: pair with Bo on tests"; stored: 2                            |
| (b) Unreadable to-do data    | Corrupt `compass.todos` written through DevTools, page reloaded: data removed, reset notice shown; next start: no notice                               | "Your saved to-do list couldn't be read, so it was reset."; stored: null; next start: false                                    |
| (a) `MOCK_TOOLS=off`, notice | The standing notice is shown (to-dos seeded through DevTools)                                                                                          | "Compass can't change your to-do list with the current engine. Your saved to-dos are safe."                                    |
| (a) Refusal                  | "Remind me to …" and "What's on my list?" get the app's card, no model text, and `compass.todos` stays **byte-identical**                              | "Not added: the current engine can't run to-do actions, so Compass didn't touch your list." \| "Not shown: …"; identical: true |
| (a) Other wording            | An ordinary question still reaches the engine; the notice stays; storage still identical                                                               | "You said: \"How do we name branches? …\""                                                                                     |
| Notice goes away             | Server restarted with tools on: no notice at start, nor after a reply                                                                                  | `{"shown":false,"atStart":false}`                                                                                              |

### `npm run verify:todos -- --live --engine=ollama` (`phi3`, CPU): 4 of 4 pass

`--engine=ollama` overrides `INFERENCE_ENGINE` from `.env`. When `GET /api/engine` reports `actions: false`, live mode runs the no-tool-calling scenario.

| Check                                                             | Result                                                                                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The standing notice is visible                                    | "Compass can't change your to-do list with the current engine. Your saved to-dos are safe."                                                                   |
| The add phrase gets the app message; storage is unchanged         | "Not added: the current engine can't run to-do actions, so Compass didn't touch your list."; "What's on my list?" → "Not shown: …"; `compass.todos` identical |
| Other wording reaches `phi3`; the notice stays; storage unchanged | `phi3` replied (see the note below)                                                                                                                           |
| No console errors                                                 | none                                                                                                                                                          |

The first live run failed only the "other wording" check. The server's idle timeout (20 s, `LLM_CONFIG.idleTimeoutMs`, unchanged) ran out while `phi3` was loading cold on CPU (`[llm] timeout: ollama sent nothing for too long`). The rerun with the model warm passed 4 of 4. Both runs passed the notice and refusal checks, which don't reach the model at all.

Note for the PO: in the passing run, `phi3`'s ordinary reply started by copying the refusal card's history line ("[The app's to-do list] Not added: …"). It doesn't claim any change, but a small model can echo the app's wording.

### `npm run verify:todos -- --live` (Anthropic, from `.env`): 9 of 9 pass

The 8 pass-1 checks, plus "no engine notice". Parallel tool use is now enabled. Several actions in one live message aren't scripted, because Claude may choose to batch the calls or not. The parsing is covered by a unit test, and the browser side by mock scenario (c).

### Unit tests added or changed (`npm test`: 256 pass)

- Phrases: `todoPhraseActions (B-11)` in `src/shared/llm/todo-phrases.test.ts`: the four phrases, ordinary messages, one action per sentence or line in order, and a phrase after an earlier paragraph.
- Capability: handler `never sends a to-do phrase to an engine without actions, and says so in start`, `refuses a to-do phrase on the mock with MOCK_TOOLS=off`, and `engine info handler (B-11)` (mock, mock off, Ollama, Anthropic; 503 on bad config; 405). Client: `fetchEngineInfo (B-11)`. Protocol: `requires a start event to say whether the engine can run actions`. Mock: `behaves like an engine without tool calling when tools are off`.
- Several actions: Anthropic `turns every tool_use of one reply into an action, in order`; mock `yields every action of a message, in order, as one reply`; to-dos `runs several actions in order, each on what the previous one stored`; chat `runs every action of a reply in order, each with its own card`, `settles the reply with one card per action, in order`, MessageList `shows one card per action of a reply, in order`.
- Refusal: `useChat … with an engine that cannot run actions (Amendment 1)`: the notice before the first message (`GET /api/engine`) and its removal on a `start` with actions; refusal cards with `execute` never called and the cards stored; other wording reaches the model. Card: `says a refused request was not done, and why`. `TodoNotices (B-11, Amendment 1)`.
- Reset notice: store `removes unreadable data, starts with an empty list, and reports the reset once`, actions `reports unreadable stored data once on restore`, chat `says once that an unreadable to-do list was reset, until a new conversation`.
- Migration: `migrates version 2 to 3: a stored action becomes a one-card list (Amendment 1)`, `migrates version 1 (B-08) through version 2 to 3`, and `round-trips several settled cards and drops pending ones after a restart`.

### Regressions after Amendment 1

All pass. `verify:persistence`: 8 of 8. `verify:chat`: 19 of 19. `verify:llm`: 10 of 10. `/api/chat` still answers only POST (`GET → 405`); the engine report lives on `/api/engine`. The live Anthropic call and the bundle secrets check also pass.

## Amendment 2 (2026-10-02, Chrome/154.0.8037.93): the intermittent "No tool calling: notice" check

### Root cause: the check, not the app

In `engineWithoutActions`, the check read the engine notice once, straight after `seedAndReload()`. `reload()` only waits for `#composer-input`, and the composer renders before `GET /api/engine` answers (`useChat`'s mount effect, `use-chat.ts`, sets `engineActions` only when `engineInfo()` resolves; until then it is `null` and `TodoNotices` hides the notice). Under load the response came after the read, so the check saw an empty notice. The app is correct whatever the order: `setEngineActions((known) => known ?? info.actions)` never lets a late engine-info overwrite a `start` event, and both answers come from the same server.

### Reproduction (commit `b6ff449`)

The MOCK_TOOLS=off scenario now injects a fetch wrapper before the app loads (`Page.addScriptToEvaluateOnNewDocument`) that holds the page's `GET /api/engine` response back for 1,500 ms on every load. With the old check, `verify:todos` failed every time on the same check, with the same symptom as the PO's run: `"No tool calling: notice" … pass: false, detail: ""`.

### Fix (commit `06e701c`)

The check waits for the notice to show (`noticeShown()`, 10 s timeout). On timeout it fails with `the "engine" notice did not show within 10000 ms (last text: "…")` instead of aborting the script. The delay stays in the scenario as a regression guard.

### Reliability after the fix

- `npm run verify:todos`: **10 of 10 consecutive runs pass**, 19 of 19 checks each. No failures seen.
- `vitest run` (through `npm test`): **5 of 5 consecutive runs pass**, 256 of 256 tests in 28 files each. No failures seen. The intermittent unit test from pass 2 didn't recur, so its cause is still unknown.
