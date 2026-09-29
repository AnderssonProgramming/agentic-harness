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
    │       ├── components/ # presentational components, data via props only
    │       ├── hooks/      # state and side effects for the feature
    │       └── model/      # types and pure functions (no React)
    └── shared/             # code used by two or more features
```

Folders may be empty until the backlog item that needs them is in progress.

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
$env:ANTHROPIC_BASE_URL = "http://localhost:11434"
$env:ANTHROPIC_AUTH_TOKEN = "ollama"
$env:ANTHROPIC_API_KEY = ""
claude --model phi3
```

Close the terminal (or remove the three variables) to switch back to the default.

Known limitation: `phi3` is a 3.8B model without reliable tool calling. It is good enough to answer questions and draft text, not to edit the repository autonomously. For agentic work on the fallback, pull a tool-capable model (e.g. `ollama pull qwen3:8b`) and pass it to `--model`.
