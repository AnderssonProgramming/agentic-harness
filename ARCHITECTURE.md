# Architecture

This file is the memory of why the project is structured the way it is.
Every entry records the decision, the reason, and the alternative we rejected.
The agent must read it before proposing any plan, and must add an ADR in the same commit as any new design decision.

## Decision index

Read this table first. Then open only the ADRs your task touches, e.g. `Grep "ADR-07" -A 12 ARCHITECTURE.md`. Don't read the whole file (CONTEXT-ROUTINE.md, step 3).

| ADR                                                                                                          | Decision                                                                                 | Status                       | Touches                  |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------- | ------------------------ |
| [ADR-01](#adr-01-folder-structure-by-feature-not-by-type)                                                    | Folders by feature (`src/features/<f>/`), roles inside                                   | Active                       | Any new code             |
| [ADR-02](#adr-02-vite--react-spa-instead-of-nextjs)                                                          | Vite + React SPA, not Next.js                                                            | Active (revisited by ADR-08) | Build, framework         |
| [ADR-03](#adr-03-inference-behind-one-interface-selected-by-an-environment-variable-keys-only-on-the-server) | One engine interface; `INFERENCE_ENGINE` picks it; keys only on the server               | Active                       | Model, secrets           |
| [ADR-04](#adr-04-conversation-state-in-a-feature-hook-with-usestate-no-state-library)                        | Conversation state in `useChat` with `useState`; pure transitions; no state library      | Active                       | Chat state, persistence  |
| [ADR-05](#adr-05-fixed-local-assistant-reply-until-the-model-is-connected)                                   | Fixed placeholder reply                                                                  | **Superseded** by B-03       | —                        |
| [ADR-06](#adr-06-a-route-table-and-a-history-api-hook-instead-of-a-router-library)                           | Route table + History API hook; no router library                                        | Active                       | Screens, navigation      |
| [ADR-07](#adr-07-each-feature-talks-to-the-outside-world-through-its-own-api-folder)                         | Features reach the outside only through `api/`                                           | Active (refined by ADR-10)   | Network, storage access  |
| [ADR-08](#adr-08-the-chat-endpoint-runs-inside-vites-own-server-mounted-by-a-plugin)                         | Chat endpoint mounted in Vite's dev/preview server; `.ts` import extensions in `server/` | Active                       | Server, endpoint         |
| [ADR-09](#adr-09-one-ndjson-event-stream-for-every-engine-plus-a-mock-engine)                                | One NDJSON event stream; 13 error codes; mock engine                                     | Active                       | Streaming, errors, tests |
| [ADR-10](#adr-10-the-conversation-is-saved-through-a-synchronous-store-in-api)                               | Synchronous `localStorage` store in `api/`; versioned snapshot; lint guard               | Active                       | Persistence, storage     |

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
├── server/llm/             # server-only: chat endpoint, engines, keys (ADR-08, ADR-09)
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

## [ADR-10] The conversation is saved through a synchronous store in `api/`

Date: 2026-10-01

Decision: `src/features/chat/api/conversation-store.ts` is the only code that touches browser storage. It saves the conversation in `localStorage` under `compass.conversation` as a versioned snapshot (`version: 1`), and its `load()`, `save()` and `clear()` are **synchronous**. This refines ADR-07: the boundary is the same, only the return type isn't a `Promise`. The store never throws: a blocked or full storage becomes a typed failure (`'unavailable'` or `'full'`), and unreadable data is removed and reported once as a reset. `model/conversation-snapshot.ts` validates and migrates the snapshot; the migrations table is a parameter, empty in production until a version 2 exists, and unknown or future versions start empty. A reply still streaming when the page closed comes back `stopped`. `useChat` saves status changes at once and streamed text at most once a second, plus on `pagehide`. An ESLint rule (`no-restricted-globals` and `no-restricted-properties`) forbids `localStorage` and `sessionStorage` everywhere in `src/` except `src/features/*/api/`.

Reason: `localStorage` is synchronous, so a synchronous store lets `useChat` restore inside its `useState` initializer: the conversation is on screen at the first paint, with no empty-then-filled flash and no loading state to design and test. The lint rule turns "components never touch storage" into a check instead of a promise. Saving the whole conversation on every streamed token would rewrite it dozens of times a second; the cost of the one-second interval is that any close, not only a crash, can lose up to about one second of streamed text (`verify:persistence` saw 40 of 60 characters survive a clean close, see `docs/evidence/b-08-verification.md`).

Rejected alternatives:

- An async store, as ADR-07 describes: rejected because it wraps a synchronous API in a `Promise` only to add a loading state and a flash of the empty chat on every start.
- IndexedDB: rejected because it's async, needs far more code, and a text conversation is well within `localStorage`'s quota. A full quota is handled anyway.
- A real "version 0" format to migrate from: rejected because no older data exists. The migration path is proven by a test with a fixture migration instead.

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
