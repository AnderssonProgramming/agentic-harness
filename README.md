# Compass

A conversational onboarding assistant for junior developers: it answers questions about a team's codebase and conventions during the first weeks on the job.

This repository is also an **AI harness**: the coding agent that builds Compass works under a written contract, and every item it delivers comes with a plan, tests and recorded evidence.

> **Sprint 1 status:** the chat screen works with local messages only. You type, your message appears, and Compass answers with a fixed note saying the model connection arrives in Sprint 2 (backlog item B-03). No network calls are made.

![Compass chat screen](docs/evidence/b-01-conversation-light.png)

## Quick start

Requirements: Node.js 22.12 or newer (includes npm), and Git.

```bash
git clone https://github.com/AnderssonProgramming/agentic-harness.git
cd agentic-harness
npm install
npm run dev
```

Open http://localhost:5173 and type a message. That's all the app needs in Sprint 1: no `.env`, no API key, no Ollama.

## Commands

| Command                | What it does                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`          | Start the dev server on port 5173                                                   |
| `npm run check`        | Typecheck + lint + format check + tests. Must pass before any commit                |
| `npm test`             | Run the unit and component tests once (Vitest + Testing Library)                    |
| `npm run verify:chat`  | With `npm run dev` running: check every B-01/B-02 criterion in headless Chrome [^1] |
| `npm run format`       | Format all files with Prettier                                                      |
| `npm run lint`         | ESLint only                                                                         |
| `npm run build`        | Typecheck and build for production into `dist/`                                     |
| `npm run preview`      | Serve the production build locally                                                  |
| `npm run engine:check` | Verify the configured inference engine answers (needs `.env`, see below)            |

[^1]: Uses the installed Google Chrome. If it's not at the default Windows path, set `CHROME_PATH`. Screenshots are written to `docs/evidence/`.

## How the harness is organized

| File                                                   | Purpose                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                               | Master context: the agent's role, rules and prohibitions             |
| [`.claude/settings.json`](.claude/settings.json)       | Enforced context exclusions and permissions                          |
| [`BACKLOG.md`](BACKLOG.md)                             | Prioritized product backlog with acceptance criteria                 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                   | Folder map, architecture decisions (ADR-01 to ADR-05), engine switch |
| [`docs/plans/`](docs/plans)                            | Step-by-step plans approved by the Product Owner before any code     |
| [`docs/evidence/`](docs/evidence)                      | Verification results, screenshots and contract-test transcripts      |
| [`docs/contract-tests.md`](docs/contract-tests.md)     | Seven deliberate rule violations and how the agent stopped each one  |
| [`docs/sprint-1-review.md`](docs/sprint-1-review.md)   | Three-minute demo script for the Sprint Review                       |
| [`docs/sprint-1-retro.md`](docs/sprint-1-retro.md)     | Harness retrospective and the rules it added                         |
| [`docs/code-walkthrough.md`](docs/code-walkthrough.md) | Line-by-line explanation of the chat feature                         |

Source layout (feature-based, see ADR-01):

```
src/
├── main.tsx
├── app/                      # shell and global styles
└── features/chat/
    ├── index.ts              # exports ChatScreen only
    ├── components/           # chat-screen, message-list, composer
    ├── hooks/                # use-chat (messages in memory), use-auto-scroll
    └── model/                # message.ts: types and pure functions
```

## Inference engine (Sprint 2 onward)

The app doesn't call a model yet, but the engine switch is already in place and tested:

```bash
cp .env.example .env    # then fill in ANTHROPIC_API_KEY
npm run engine:check
```

- `INFERENCE_ENGINE=anthropic` (default) uses Claude and needs `ANTHROPIC_API_KEY`.
- `INFERENCE_ENGINE=ollama` uses local `phi3`. Install [Ollama](https://ollama.com), run `ollama pull phi3`, and make sure it's running.

Details, including how to point the coding agent itself at Ollama, are in [ARCHITECTURE.md](ARCHITECTURE.md#inference-engine).

## Troubleshooting

- **Port 5173 is already in use:** the dev server uses `strictPort`, so it fails instead of silently moving. Stop the other process or run `npm run dev -- --port 5174`.
- **`engine:check` says Ollama is not running while it is:** make sure `OLLAMA_BASE_URL` uses `127.0.0.1`, not `localhost` (Node 22 tries IPv6 first).
