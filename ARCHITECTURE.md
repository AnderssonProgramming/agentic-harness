# Architecture

This file is the memory of why the project is structured the way it is.
Every entry records the decision, the reason, and the alternative we rejected.
The agent must read it before proposing any plan, and must add an ADR in the same commit as any new design decision.

## Decision index

Read this table first. Then open only the ADRs your task touches, e.g. `Grep "ADR-07" -A 12 ARCHITECTURE.md`. Don't read the whole file (CONTEXT-ROUTINE.md, step 3).

| ADR                                                                                                                | Decision                                                                                                                     | Status                                                                          | Touches                      |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| [ADR-01](#adr-01-folder-structure-by-feature-not-by-type)                                                          | Folders by feature (`src/features/<f>/`), roles inside                                                                       | Active                                                                          | Any new code                 |
| [ADR-02](#adr-02-vite--react-spa-instead-of-nextjs)                                                                | Vite + React SPA, not Next.js                                                                                                | Active (revisited by ADR-08)                                                    | Build, framework             |
| [ADR-03](#adr-03-inference-behind-one-interface-selected-by-an-environment-variable-keys-only-on-the-server)       | One engine interface; `INFERENCE_ENGINE` picks it; keys only on the server                                                   | Active                                                                          | Model, secrets               |
| [ADR-04](#adr-04-conversation-state-in-a-feature-hook-with-usestate-no-state-library)                              | Conversation state in `useChat` with `useState`; pure transitions; no state library                                          | Active                                                                          | Chat state, persistence      |
| [ADR-05](#adr-05-fixed-local-assistant-reply-until-the-model-is-connected)                                         | Fixed placeholder reply                                                                                                      | **Superseded** by B-03                                                          | —                            |
| [ADR-06](#adr-06-a-route-table-and-a-history-api-hook-instead-of-a-router-library)                                 | Route table + History API hook; no router library                                                                            | Active                                                                          | Screens, navigation          |
| [ADR-07](#adr-07-each-feature-talks-to-the-outside-world-through-its-own-api-folder)                               | Features reach the outside only through `api/`                                                                               | Active (refined by ADR-10)                                                      | Network, storage access      |
| [ADR-08](#adr-08-the-chat-endpoint-runs-inside-vites-own-server-mounted-by-a-plugin)                               | Chat endpoint mounted in Vite's dev/preview server; `.ts` import extensions in `server/`                                     | Active                                                                          | Server, endpoint             |
| [ADR-09](#adr-09-one-ndjson-event-stream-for-every-engine-plus-a-mock-engine)                                      | One NDJSON event stream; 13 error codes; mock engine                                                                         | Active (extended by ADR-11: `action` event, `start.actions`, `GET /api/engine`) | Streaming, errors, tests     |
| [ADR-10](#adr-10-the-conversation-is-saved-through-a-synchronous-store-in-api)                                     | Synchronous `localStorage` store in `api/`; versioned snapshot; lint guard                                                   | Active (snapshot now at version 3: migrations 1→2→3)                            | Persistence, storage         |
| [ADR-11](#adr-11-the-model-requests-to-do-actions-the-browser-runs-them-and-confirms)                              | The model requests to-do actions (`action` event); the browser runs them and confirms                                        | Accepted with corrections (B-12 update: "list" from storage on every engine)    | To-dos, protocol, tools      |
| [ADR-12](#adr-12-b-06s-knowledge-base-goes-whole-into-the-system-prompt-within-a-total-budget-and-a-secrets-guard) | B-06: knowledge files go whole into the system prompt, with a total budget per engine and a secrets guard; no RAG            | Accepted with corrections, built (B-06); LLM-05's bound now per engine          | Knowledge base, prompt size  |
| [ADR-13](#adr-13-one-transport-free-chat-core-with-a-node-adapter-and-a-web-adapter)                               | One transport-free chat core; a Node `(req, res)` adapter for Vite and a Web `Request` adapter for the two Netlify Functions | Active                                                                          | Server, endpoint, deployment |
| [ADR-14](#adr-14-the-model-cites-the-browser-verifies-against-the-loaded-documents)                                | B-07: the model ends with a `Sources:` line; the browser checks each name against `GET /api/knowledge` and shows chips       | Proposed by the agent, pending PO review                                        | Citations, knowledge routes  |

New ADRs add a row here in the same commit.

## Folder structure

```
.
├── CLAUDE.md               # master context (agent contract)
├── BACKLOG.md              # prioritized product backlog
├── ARCHITECTURE.md         # this file
├── .claude/settings.json   # enforced context exclusions and permissions
├── .claude/skills/         # Custom Skills (one folder per skill, SKILL.md inside)
├── docs/                   # contract tests and other evidence
├── scripts/                # Node scripts run by npm (no build step)
├── server/llm/             # server-only: chat endpoint, engines, keys (ADR-08, ADR-09, ADR-13)
├── netlify/functions/      # production entry point only (ADR-13); its test is in server/llm/,
│                           # because Netlify deploys every file here as a function
├── index.html              # Vite entry HTML
└── src/
    ├── main.tsx            # mounts <App /> into #root, nothing else
    ├── app/                # app shell: layout, navigation, global styles
    │   ├── routes.ts       # the route table (ADR-06); new-route skill appends here
    │   └── hooks/          # use-route: current path and navigate()
    ├── features/
    │   └── chat/           # everything for the chat screen (B-01, B-02)
    │       ├── index.ts    # public surface of the feature: exports ChatScreen only
    │       ├── chat.css    # styles for this feature only
    │       ├── components/ # chat-screen (composition), message-list, composer
    │       ├── hooks/      # use-chat (messages), use-auto-scroll
    │       ├── model/      # message.ts: types and pure functions (no React)
    │       └── api/        # integration point with external services (ADR-07), when needed
    └── shared/             # code used by two or more features
        └── llm/            # wire protocol, errors and streamChat client (ADR-09)
```

Folders may be empty until the backlog item that needs them is in progress.
Tests live next to the file they test (`message.ts` → `message.test.ts`).
Other features import a feature only through its `index.ts`, never its internal files.

## [ADR-01] Folder structure by feature, not by type

Date: 2026-09-28

Decision: we group code by feature (`src/features/chat/`), and inside each feature by role (`components/`, `hooks/`, `model/`). Nothing is shared until a second feature needs it.

Reason: the agent finds all the context for a feature in one folder, which reduces what it has to load per task and keeps each change inside one directory that is easy to review.

Rejected alternative: top-level `components/`, `hooks/`, `types/`. Rejected because understanding one screen would force the agent (and me) to jump across four folders, and unrelated code would end up loaded in the same context.

## [ADR-02] Vite + React SPA instead of Next.js

Date: 2026-09-28

Decision: the app is a client-side single-page application built with Vite 8 and React 19.

Reason: in Sprint 1 the app has no server logic at all. Vite gives a one-command dev server, a small config surface the agent can fully understand, and no framework conventions (routing, server components, caching) that the agent could misapply.

Rejected alternative: Next.js. Rejected for now because its server/client split and build conventions add complexity we don't need until inference exists. When B-03 needs a server to hold the API key, we will add a minimal server (see ADR-03) and revisit this decision in a new ADR.

## [ADR-03] Inference behind one interface, selected by an environment variable, keys only on the server

Date: 2026-09-28

Decision: every call to a language model goes through a single `InferenceEngine` interface with one implementation per provider (`anthropic`, `ollama`). The active one is chosen by `INFERENCE_ENGINE` at startup. Provider keys are read only by server-side code; the browser talks to our own endpoint, never to a provider.

Reason: switching engines when credits run out must be a config change, not a code change. And any key shipped to the browser is a leaked key: Vite inlines every `VITE_*` variable into the public bundle.

Rejected alternative: calling the Anthropic API directly from React with a `VITE_ANTHROPIC_API_KEY`. Rejected because it exposes the key to every user and couples UI components to a specific provider.

## [ADR-04] Conversation state in a feature hook with `useState`, no state library

Date: 2026-09-30

Decision: the list of messages lives in `useChat` (`src/features/chat/hooks/use-chat.ts`) as React `useState`, and every change goes through the pure functions in `model/message.ts`. `ChatScreen` is the only component that calls the hooks; `MessageList` and `Composer` receive data and callbacks through props. The one exception is the composer's draft text, which is ephemeral input state and stays local to `Composer`.

Reason: one screen with one list does not need a global store. Keeping the transitions in pure functions means they are unit-tested without React (7 tests), and when B-03 and B-08 arrive, only the hook changes: it will call the engine and storage, while the components stay the same.

Rejected alternative: a state library (Redux Toolkit, Zustand) or React Context. Rejected because it would add a dependency and a second place to look for state, with no second consumer to justify it. We will revisit when a second feature needs the conversation.

## [ADR-05] Fixed local assistant reply until the model is connected

Date: 2026-09-30. **Superseded by B-03 (Sprint 2, week 4):** the placeholder is removed once the chat streams real replies. The `mock` engine of ADR-09 takes over its role in tests.

Decision: every accepted user message is followed by a fixed assistant message (`PLACEHOLDER_REPLY` in `model/message.ts`) that says the model connection arrives with B-03.

Reason: B-01 requires user and assistant messages to be visually distinct, which can't be verified without assistant messages. Sprint 1 forbids any model call. A fixed, honest reply satisfies both, and B-03 replaces it at a single point (`appendExchange`).

Rejected alternative: echoing the user's text back, or scripted fake answers. Rejected because both look like the assistant is answering, which would mislead a user and hide that the product doesn't think yet.

## [ADR-06] A route table and a History API hook instead of a router library

Date: 2026-09-30

Decision: routes are a typed array in `src/app/routes.ts` (`path`, `title`, `component`). A `useRoute` hook reads `location.pathname` through `useSyncExternalStore` and exposes `navigate(path)`, which calls `history.pushState`. `App` renders the matching component, builds the navigation from the same table, and shows a not-found view otherwise. Paths are exact matches; there are no nested or dynamic routes.

Reason: Compass has a handful of flat screens. Forty lines we fully understand beat a library whose data loaders and framework mode overlap with ADR-02. It also gives the `new-route` skill one predictable place to edit: one import and one entry in one file.

Rejected alternative: `react-router`. Rejected for now because it would be a new dependency and more API surface for the agent to misuse, and we need none of its features yet. We'll revisit if we need route parameters (e.g. `/docs/:id`) or nested layouts.

## [ADR-07] Each feature talks to the outside world through its own `api/` folder

Date: 2026-09-30

Decision: a feature that needs data from outside the browser gets `src/features/<feature>/api/<feature>-api.ts`, which exports async functions returning typed data (`loadKnowledge(): Promise<KnowledgeData>`). Hooks call these functions; components never do. Until a backlog item connects a real service, the function returns local placeholder data.

Reason: it's the integration point the Web track asks for. Loading and error states can be built and tested now, and when Skill 2 connects the model, only the body of the `api/` function changes. The hook, the view and their tests stay the same.

Rejected alternative: calling `fetch` inside hooks. Rejected because the hook would then mix React state with transport details (URLs, headers, parsing), and every test of the hook would need to mock the network.

## [ADR-08] The chat endpoint runs inside Vite's own server, mounted by a plugin

Date: 2026-09-30

Decision: `server/llm/handler.ts` is a plain Node `(req, res)` function. `server/llm/vite-plugin.ts` mounts it at `/api/chat` on Vite's dev **and** preview servers. Its variables come from `.env` through `loadEnv(mode, root, '')`, with no `VITE_` prefix, and the real environment wins over the file. Server code imports with explicit `.ts` extensions, because Vite 8's native config loader requires them for everything reachable from `vite.config.ts`.

Reason: ADR-03 needs a server to hold the key, and the README promises one command to run the app. A plugin gives both with no new dependency. Because the handler only depends on `node:http` types, it can be mounted in any Node server when we deploy. This revisits ADR-02 without replacing it: the browser side is still a Vite SPA.

Rejected alternatives:

- A separate Express or Hono server with a Vite proxy: rejected because it means two processes, a new dependency, and `concurrently` to keep one command.
- Next.js route handlers: rejected because it's the framework switch ADR-02 already turned down.

## [ADR-09] One NDJSON event stream for every engine, plus a mock engine

Date: 2026-09-30

Decision: the endpoint takes `{ messages }` and always answers 200 with `application/x-ndjson`. The stream is `start` (engine, model), `delta`* (text), and then `done` or `error` (`code`, `message`, `engine`, `retryable`). Anthropic's server-sent events and Ollama's NDJSON are translated on the server, and failures are mapped to 13 codes (`network`, `timeout`, `auth`, `rate_limit`, `quota`, …). The browser shows `describeChatError(code)`, never the raw message. A third engine, `mock`, streams a deterministic echo that counts the user turns it received; `[mock:<code>]` in a message makes it fail with that code.

Reason: the UI has one code path whichever engine answers, so switching engines (B-04) can't break the chat. Error codes let the UI say something useful ("Ollama isn't running…") and decide whether Retry makes sense. The mock makes browser tests and the error demo deterministic, free and offline, and the turn count proves the history arrives.

Rejected alternatives:

- Passing the provider's own stream through: rejected because the browser would need two parsers and would see provider-specific errors.
- HTTP status codes for errors: rejected because once streaming starts the status is already sent, so mid-stream failures need an in-band event anyway. Using one mechanism for both is simpler.

**B-13 update (2026-10-03, accepted by the PO):** the stream has **two server timeouts**, both ending in the existing `timeout` event, so the protocol is unchanged:

- a per-engine **first-chunk timeout**: 120 s for Ollama, because a cold model loads on CPU; 30 s for Anthropic and the mock;
- the unchanged 20 s **idle timeout** between chunks.

The browser waits 150 s for the first chunk, longer than any server limit, so the server's `timeout` always arrives first. After that, it keeps its 30 s gap between chunks. **Rejected:** one longer idle timeout for everything, because it would also delay detecting a stream that stalls mid-reply.

## [ADR-10] The conversation is saved through a synchronous store in `api/`

Date: 2026-10-01

Decision: `src/features/chat/api/conversation-store.ts` is the only code that touches browser storage. It saves the conversation in `localStorage` under `compass.conversation` as a versioned snapshot (`version: 1`), and its `load()`, `save()` and `clear()` are **synchronous**. This refines ADR-07: the boundary is the same, only the return type isn't a `Promise`. The store never throws: a blocked or full storage becomes a typed failure (`'unavailable'` or `'full'`), and unreadable data is removed and reported once as a reset. `model/conversation-snapshot.ts` validates and migrates the snapshot; the migrations table is a parameter, empty in production until a version 2 exists, and unknown or future versions start empty. A reply still streaming when the page closed comes back `stopped`. `useChat` saves status changes at once and streamed text at most once a second, plus on `pagehide`. An ESLint rule (`no-restricted-globals` and `no-restricted-properties`) forbids `localStorage` and `sessionStorage` everywhere in `src/` except `src/features/*/api/`.

Reason: `localStorage` is synchronous, so a synchronous store lets `useChat` restore inside its `useState` initializer: the conversation is on screen at the first paint, with no empty-then-filled flash and no loading state to design and test. The lint rule turns "components never touch storage" into a check instead of a promise. Saving the whole conversation on every streamed token would rewrite it dozens of times a second; the cost of the one-second interval is that any close, not only a crash, can lose up to about one second of streamed text (`verify:persistence` saw 40 of 60 characters survive a clean close, see `docs/evidence/b-08-verification.md`).

Rejected alternatives:

- An async store, as ADR-07 describes: rejected because it wraps a synchronous API in a `Promise` only to add a loading state and a flash of the empty chat on every start.
- IndexedDB: rejected because it's async, needs far more code, and a text conversation is well within `localStorage`'s quota. A full quota is handled anyway.
- A real "version 0" format to migrate from: rejected because no older data exists. The migration path is proven by a test with a fixture migration instead.

## [ADR-11] The model requests to-do actions, the browser runs them and confirms

Date: 2026-10-01. Status: **Accepted with corrections by the PO on 2026-10-01** (see "PO review" at the end of this ADR). Proposed by the `feature-builder` subagent (B-11 delegation contract, Decisions 1–5, Amendment 1).

Decision:

- **Wire (ADR-09 gains one event).** The stream may carry `{ type: 'action', action }`, where `action` is a `TodoAction`: `add` (`text`), `list`, or `complete` (`id` or `null`, plus a `query` describing it). The request may carry `todos: { id, text }[]`, the user's open to-dos. Engines yield text or actions; the handler forwards both.
- **Engines.** Anthropic declares three tools (`add_todo`, `list_todos`, `complete_todo`) with parallel tool use off, gets the open to-dos in its system prompt, and turns the first `tool_use` block into an action. The mock emits the same action from "remind me to …", "add … to my list", "what's on my list" and "mark … as done". Ollama declares no tools. The shared system prompt tells every model that only the app changes or confirms the list.
- **Execution.** `src/features/todos/` owns the list: a versioned snapshot under `compass.todos` and a synchronous store that never throws (the ADR-10 pattern). `useChat` runs the action only after the stream ends with `done`, through the to-do feature's `index.ts`. The executor loads, changes and saves, then **reads the list back** and builds the card from what's stored. A storage failure gives a failure card and changes nothing. "Complete" matches only open to-dos: by id if the model gave a valid one, otherwise by the query's words. None or several matches change nothing and ask which one.
- **Cards.** The reply's `action` field moves from `pending` (set when the event arrives) to `settled` with the card. When an action arrives, the reply's streamed text is dropped, so model text can never stand beside, or replace, the app's confirmation. A failed or stopped stream drops a pending action without running it. The conversation snapshot moves to version 2 (migration 1 → 2 adds `action: null`). The model gets each card back as a one-line text summary in the history, so the next turn has context.

Reason: the app, not the model, is the source of truth for the list. Only data read back from storage can produce "Added" or "Marked as done", which makes a false confirmation structurally impossible, whatever the engine says. Running in the browser keeps the list where ADR-10 keeps the conversation, with no server storage to add.

Rejected alternatives:

- Executing on the server and sending the result back to the model as a `tool_result`: rejected because the data lives in the browser, and the model's follow-up text would become a second, unverified confirmation.
- Parsing intent in the browser with regular expressions for every engine: rejected by the contract (the model recognizes intent); the regexes exist only in the mock.
- One event type per action: rejected because the contract allows exactly one new event type.

Amendment 1 (2026-10-01, B-11 contract Amendment 1, still **Proposed**). A system prompt doesn't stop a small local model (`phi3`) from claiming it saved a to-do, so:

- **Capability, not instructions.** Each engine declares `actions` (Anthropic and the mock: true; Ollama, and the mock with `MOCK_TOOLS=off`: false). The `start` event carries it, and `GET /api/engine` returns `{ engine, model, actions }` (503 with the error on a bad configuration) so the browser knows before the first message. `/api/chat` keeps answering only POST.
- **To-do phrases never reach an engine without actions.** The known phrases ("remind me to …", "add … to my list", "what's on my list", "mark … as done") live in `src/shared/llm/todo-phrases.ts`, one action per sentence or line. When the engine has no actions and the last user turn contains one, the handler sends `start` and `done` without calling the model, and the browser replies with an app card per phrase: not done, and why. Nothing stored changes. Other wording reaches the model as before. This is matching in order to **refuse**, never to run: the rejected alternative above still holds.
- **Standing notice.** While the engine can't run actions, the chat shows that Compass can't change the to-do list with it and that saved to-dos are safe. It goes away when an engine with actions answers.
- **Unreadable to-do data** is still removed, and the chat says so once, like an unreadable conversation (B-08).
- **Several actions per reply.** Anthropic allows parallel tool use; every `tool_use`, and every to-do sentence for the mock, becomes an action event in order. The browser runs them in that order after `done`, each with its own card. The conversation snapshot moves to version 3: `action` becomes `actions` (a list), with a migration from version 2.

**PO review (2026-10-01): accepted with corrections.**

- **Agent's proposal:** the model requests to-do actions through tool calling; the browser runs them on its own stored list, reads the list back, and builds the confirmation card from what's stored (plus Amendment 1: engines declare whether they can run actions, to-do phrases never reach an engine without them, a standing notice, several actions per reply).
- **Decision:** accepted, with these corrections.
  1. **The pass-1 claim was false as written.** "Makes a false confirmation structurally impossible, whatever the engine says" didn't hold: on `phi3`, the model's own text said "I've set a reminder" with nothing stored. Only the **cards** are structurally honest. The model's text on engines without tool calling is kept honest by Amendment 1's capability-based refusal, not by the prompt. This ADR is accepted only together with Amendment 1.
  2. **The protocol changed twice, not once.** The `start` event gained `actions`, and `GET /api/engine` is new, beyond the one `action` event the contract allowed. The agent flagged this itself. Accepted, and recorded in ADR-09.
  3. **Refusing "what's on my list?" on an engine without tools contradicts this ADR's own principle** (data, not model). The app can read the list from storage on any engine. My amendment said "not performed", and the agent took it literally, so the error is in my contract. Fixed later in backlog item **B-12**, not by reopening this delegation.
  4. **The 20 s idle timeout is too short for a local model loading cold on CPU.** The first Ollama reply timed out twice this week. Tracked as **B-13**.
- **Reason:** the design solves the real problem (the user can trust what Compass says about the list), it fits ADR-01, ADR-07 and ADR-10 (browser-side store, versioned snapshot, never throws), and its pieces are small, tested, pure functions I can maintain and audit in Sprint 4.
- **Rejected alternatives:**
  - the agent's pass-1 choices "only the first action counts" and "unreadable to-do data is reset with no notice", both overruled in Amendment 1;
  - executing on the server, which the agent also rejected.

**B-12 update (2026-10-03, delegation `docs/delegations/b-12-list-from-storage.md`):** this resolves correction 3. On an engine without actions, the server still holds back every message the shared matcher (`todo-phrases.ts`) recognizes, so the model is never called and the protocol doesn't change. The browser now answers each phrase in order. A **list** phrase runs as a `list` action on the stored list and gets the same card as with Claude, the empty-list card included. **Add** and **complete** keep Amendment 1's refusal with nothing touched. The detection is in the browser because the server already does the holding back, and only the browser can read the list. The `unsupported` card for `list` is no longer produced, but it stays valid so that conversations saved before B-12 still load. **Rejected:** having the server emit a `list` action event, because it would give the server a second job (deciding the answer, not only holding the message back) and add a protocol path, when the browser can already settle it.

## [ADR-12] B-06's knowledge base goes whole into the system prompt, within a total budget and a secrets guard

Date: 2026-10-01. Status: **Accepted with corrections, built (B-06)** on 2026-10-03; see the B-06 update below.

**Agent's proposal** (a read-only session asked for an architecture for B-06; the transcript is in `docs/evidence/adr-12-proposal.md`):

- On every request, the server reads `knowledge/*.md` and appends each file to the system prompt as a `<document source="…">` block, with no retrieval.
- Files over 50 KB are skipped with a warning.
- It's injected into the handler like `env`; no new dependencies; no protocol change.

**Decision: accepted with corrections.**

The approach stays. Two risks the proposal left open become requirements:

1. **A total budget, not only a per-file limit.** Ten files of 50 KB is about 125k tokens, and Ollama's small default context **silently truncates** a long prompt. That would cut off the system prompt and quietly break B-04 ("switching engines needs no code change").
   - **Total budget per engine:** about 40,000 characters for Anthropic, and about 8,000 for Ollama unless the request sets `num_ctx` large enough.
   - **Fixed order:** files load in alphabetical order. Whatever doesn't fit is skipped, with a warning that lists the files left out.
2. **A secrets guard.** Everything in `knowledge/` goes to the provider, so one pasted key in a convention doc would break ADR-03 ("keys only on the server") by design. Any file that matches a key pattern (`sk-ant-`, `-----BEGIN … PRIVATE KEY`, `api_key=`-style assignments) is **skipped, never sent**, and named in the warning.

Answers to the proposal's questions:

- **The warning goes to the server console** (B-06's "console"). Showing it in the browser would need a new event.
- **Over budget, files are skipped with a warning.** The request never fails.
- **Criterion 2 needs both kinds of evidence:** a deterministic test that the content reaches `system`, plus a recorded live check against a fixture `knowledge/`.

**Reason:**

- It solves the real problem: answers from the team's own documents, for a 15-person team.
- It fits ADR-03, ADR-08 and ADR-09.
- Plain file reading plus two guards is easy to maintain and audit.

The corrections protect two promises the product already made: engine switching (B-04) and keys staying on the server (ADR-03).

**Rejected alternatives:**

- **RAG with embeddings and a vector store.** The agent rejected it too: new dependencies, non-determinism and per-chunk citations (B-07), for a scale problem we don't have.
- **The proposal as submitted, with only a per-file limit.** Rejected, because its main risk was left as a "risk to measure" instead of a requirement.

**B-06 update (2026-10-03, built by the `feature-builder` subagent; contract `docs/delegations/b-06-knowledge-base.md`, Amendment 1):**

- **LLM-05's bound is now per engine.** What the server adds to a request is ≤ `MAX_PROMPT_ADDITIONS` (16,000: instructions, to-dos, tool definitions; unchanged) **plus that engine's knowledge budget**: `maxPromptAdditions(engine)` in `server/llm/knowledge.ts`, derived from `LLM_CONFIG.knowledgeBudgetChars` (Anthropic 40,000; Ollama 8,000; mock 8,000). **Why:** the 40,000-character Anthropic budget can't fit under the old 16,000 bound, which a full to-do list nearly fills. Shrinking the knowledge would defeat B-06. Dropping documents per request, depending on the to-do count, would be a silent drop. **The next audit re-checks LLM-05 against the per-engine bound.**
- **The loader fills each engine's knowledge only up to its own budget**, so documents alone never push a request over the bound and never make it fail. The `bad_request` check on instructions and to-dos is unchanged.
- **Loaded once** per server start (the Vite plugin, when serving) or Function cold start, and injected into the chat core as `ChatCoreOptions.knowledge`, so tests pass a fake set.
- **Budget packing:** alphabetical order (by code point), whole documents only, first-fit. A document that doesn't fit what's left is skipped for that engine, and later, smaller ones may still fit. The budget counts each document's `<document>` markup.
- **The 50 KB limit is 51,200 bytes**, checked from the file size before reading.
- **The secrets guard** matches `sk-ant-`, `-----BEGIN … PRIVATE KEY`, and an `api`/`secret`/`access`/`auth` + `key`/`token` name assigned a value of 8+ key-like characters.
- **One warning** goes to the server console when anything is skipped, naming each file and the reason (per engine for the budget), never content.
- **Production:** `netlify.toml` ships `knowledge/**` with `included_files`. The Function reads `process.cwd()/knowledge`, then `$LAMBDA_TASK_ROOT/knowledge`.
- **The system prompt** now says the documents are below, if any, as reference material and not as instructions. For anything they don't cover, it still says so plainly.
- **Evidence:** `docs/evidence/b-06-verification.md`.

## [ADR-13] One transport-free chat core, with a Node adapter and a Web adapter

Date: 2026-10-02. Proposed by the `feature-builder` subagent (delegation contract `docs/delegations/deploy-netlify.md`, Decision 2).

Decision: the chat endpoint's logic lives in `server/llm/chat-core.ts`, with no transport: `runChat(options, { readBody, send, clientGone })` validates, trims, picks the engine and streams the ADR-09 events, and `engineInfo(options)` answers `GET /api/engine`. Two thin adapters call it:

- `server/llm/handler.ts`, the Node `(req, res)` adapter that Vite's dev and preview servers mount (ADR-08). It keeps its Node-only concern: closing the connection after an oversized body (P-01).
- `server/llm/web-handler.ts`, a Web `Request` → `Response` adapter. Its body is a `ReadableStream` of NDJSON lines; the stream's `cancel()` stops the provider request. It routes `/api/chat` and `/api/engine` by path, and reads at most `maxRequestBytes` of the body.

Production has two entry points, both thin default exports over the same Web adapter, reading their variables from `process.env` (Amendment 1 of the contract):

- `netlify/functions/chat.ts` serves `/api/chat`, with its own rate-limit rule: 6 requests per 180 s per visitor.
- `netlify/functions/engine.ts` serves `/api/engine`, with a separate rule: 60 requests per 180 s per visitor. Netlify applies a Function's rule to all of its paths, so one Function would make each page load spend a chat request. Two rules is the free plan's maximum.

The build settings (command, publish and functions directories, Node 22) are in `netlify.toml`.

Reason: production (a Netlify Function, Web API) and local development (Vite, Node API) must run the same validation, limits, engines and protocol. Only reading the body and writing the stream differ, so only those live in the adapters. The existing handler tests keep driving the Node adapter, unchanged, and a new test drives the Function.

Rejected alternatives:

- **Converting Node's `(req, res)` into a `Request` and back, with one Web handler only.** Rejected, because it would add a conversion layer to the dev server and lose the P-01 connection handling, which needs the Node response.
- **A second copy of the handler for the Function.** Rejected by Decision 2 of the contract: two copies drift, and the limits are invariants (CLAUDE.md).

## [ADR-14] The model cites, the browser verifies against the loaded documents

Date: 2026-10-03. Status: **Proposed by the agent, pending PO review.** Written by the `feature-builder` subagent (delegation contract `docs/delegations/b-07-cited-answers.md`, Decisions 1 to 4).

Decision:

- **Prompt (a request, not the control).** `server/llm/system-prompt.ts` asks the model to end an answer that uses the team's documents with one line, `Sources: a.md, b.md`, and, when no document applies, to say so and write no Sources line.
- **Server.** `server/llm/knowledge-route.ts` is transport-free like the chat core (ADR-13): `GET /api/knowledge` lists `[{ source, title }]` for the documents the **active engine** was given (B-06's guards already passed, ADR-12), and `GET /api/knowledge/<source>` returns one document's text from memory. A requested name is only looked up in that in-memory list. It never becomes a filesystem path, so `../`, absolute paths, a second `/` and undecodable escapes all get 404. Both adapters route it. In production it's served by the **engine** Function (`/api/knowledge` and `/api/knowledge/*` added to its `config.path`), under its 60-per-180-s rule. The free plan has no third rule.
- **Browser.** `src/features/chat/model/citations.ts` parses the reply's last non-blank line on render (`parseSources`) and classifies each name against the fetched list (`classifySources`): `known` becomes a chip button, `unknown` stays visible as plain text marked "not a known document", and `unchecked` (the list couldn't be fetched) is plain text marked "couldn't be checked". Names are never dropped, and matching is exact. A streaming reply isn't parsed until it finishes. The text is still stored as received, Sources line included, so the stored shape doesn't change and no snapshot version bump is needed (ADR-10).
- **Panel.** `useKnowledge` (in `hooks/`, called only by `ChatScreen`, ADR-04) fetches the list once and opens only a known document. The presentational `SourcePanel` shows it as plain text in a `<pre>`, takes focus, and closes with its button or Escape. `ChatScreen` keeps the opening chip in a ref and returns focus to it. On screens 40rem wide or narrower the panel covers the whole chat. Under `prefers-reduced-motion` it doesn't animate.

Reason: the contract's Decision 1. A prompt is never the control (CLAUDE.md), so the claim "this came from X" is checked by the app against what the server actually loaded, and a wrong claim is visibly contradicted, not hidden.

Rejected alternatives:

- **Parse the Sources line on the server and send it as a new stream event.** Rejected: it would change the ADR-09 protocol and the stored shape, and a reload would lose the citations of older messages. Deriving them on render from the stored text works for every message, old ones included.
- **Fuzzy-match near-miss names (case, a `knowledge/` prefix, a missing `.md`).** Rejected: guessing which document the model meant is exactly the kind of quiet repair CLAUDE.md forbids. A near miss is shown as "not a known document".
- **Render the document as Markdown.** Rejected by Decision 3 (plain text). It would also need a dependency or a hand-written renderer, which would be an XSS surface.

## Inference engine

This section documents the engine switch for both the development harness (the agent) and the app.

- Default engine: Anthropic Claude (`claude-sonnet-5`) via the Anthropic API.
- Fallback engine: local Ollama with `phi3` (already pulled on the dev machine).
- When to switch: when API credits run out, when the API is down, or when the content is sensitive and must not leave the machine.

### Switching the app (B-03, B-04)

Set the variable in `.env` (copy it from `.env.example`) and restart:

```
INFERENCE_ENGINE=anthropic   # default, needs ANTHROPIC_API_KEY
INFERENCE_ENGINE=ollama      # local, needs `ollama serve` and OLLAMA_MODEL (default phi3)
```

Verify the active engine answers with:

```
npm run engine:check
```

### Switching the harness (the coding agent)

Ollama 0.14+ exposes an Anthropic-compatible API, so Claude Code can run against the local model without any code change. In PowerShell:

```powershell
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:11434"
$env:ANTHROPIC_AUTH_TOKEN = "ollama"
$env:ANTHROPIC_API_KEY = ""
claude --model phi3
```

Close the terminal (or remove the three variables) to switch back to the default.

Known limitation: `phi3` is a 3.8B model without reliable tool calling. It is good enough to answer questions and draft text, not to edit the repository autonomously. For agentic work on the fallback, pull a tool-capable model (e.g. `ollama pull qwen3:8b`) and pass it to `--model`.
