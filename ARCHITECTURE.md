# Architecture

This file is the memory of why the project is structured the way it is.
Every entry records the decision, the reason, and the alternative we rejected.
The agent must read it before proposing any plan, and must add an ADR in the same commit as any new design decision.

## Folder structure

```
.
├── CLAUDE.md               # master context (agent contract)
├── BACKLOG.md              # prioritized product backlog
├── ARCHITECTURE.md         # this file
├── .claude/settings.json   # enforced context exclusions and permissions
├── docs/                   # contract tests and other evidence
├── scripts/                # Node scripts run by npm (no build step)
├── index.html              # Vite entry HTML
└── src/
    ├── main.tsx            # mounts <App /> into #root, nothing else
    ├── app/                # app shell: root component and global styles
    ├── features/
    │   └── chat/           # everything for the chat screen (B-01, B-02)
    │       ├── index.ts    # public surface of the feature: exports ChatScreen only
    │       ├── chat.css    # styles for this feature only
    │       ├── components/ # chat-screen (composition), message-list, composer
    │       ├── hooks/      # use-chat (messages), use-auto-scroll
    │       └── model/      # message.ts: types and pure functions (no React)
    └── shared/             # code used by two or more features
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

Date: 2026-09-30

Decision: every accepted user message is followed by a fixed assistant message (`PLACEHOLDER_REPLY` in `model/message.ts`) that says the model connection arrives with B-03.

Reason: B-01 requires user and assistant messages to be visually distinct, which can't be verified without assistant messages. Sprint 1 forbids any model call. A fixed, honest reply satisfies both, and B-03 replaces it at a single point (`appendExchange`).

Rejected alternative: echoing the user's text back, or scripted fake answers. Rejected because both look like the assistant is answering, which would mislead a user and hide that the product doesn't think yet.

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
