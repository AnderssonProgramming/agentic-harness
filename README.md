# Compass

A conversational onboarding assistant for junior developers: it answers questions about a team's codebase and conventions during the first weeks on the job.

This repository is also an **AI harness**: the coding agent that builds Compass works under a written contract, and every item it delivers comes with a plan, tests and recorded evidence.

> **Status (Sprint 2, week 3):** the chat works with local messages only. You type, your message appears, and Compass answers with a fixed note saying the model connection arrives with backlog item B-03 (Sprint 2, week 4). No network calls are made. The app now has routing, and the first Custom Skill (`new-route`) adds new screens in one command.

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

| Command                                    | What it does                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `npm run dev`                              | Start the dev server on port 5173                                               |
| `npm run check`                            | Typecheck + lint + format check + tests. Must pass before any commit            |
| `npm test`                                 | Run the unit and component tests once (Vitest + Testing Library)                |
| `npm run verify:chat`                      | Check every B-01/B-02 criterion in headless Chrome (starts its own server) [^1] |
| `npm run verify:route -- <path> "<title>"` | Check that a route loads by URL and by nav click in headless Chrome [^1] [^2]   |
| `npm run format`                           | Format all files with Prettier                                                  |
| `npm run lint`                             | ESLint only                                                                     |
| `npm run build`                            | Typecheck and build for production into `dist/`                                 |
| `npm run preview`                          | Serve the production build locally                                              |
| `npm run engine:check`                     | Verify the configured inference engine answers (needs `.env`, see below)        |

[^1]: Uses the installed Google Chrome. If it's not at the default Windows path, set `CHROME_PATH`. Set `APP_URL` to check an already-running server instead of starting one.

[^2]: Pass the path without the leading slash (`knowledge`, not `/knowledge`): Git Bash on Windows rewrites arguments that start with `/`.

## How the harness is organized

| File                                                   | Purpose                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                               | Master context: the agent's role, rules and prohibitions              |
| [`.claude/settings.json`](.claude/settings.json)       | Enforced context exclusions and permissions                           |
| [`BACKLOG.md`](BACKLOG.md)                             | Prioritized product backlog with acceptance criteria                  |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                   | Folder map, architecture decisions (ADR-01 to ADR-07), engine switch  |
| [`TASKS.md`](TASKS.md)                                 | Repeated tasks measured as Custom Skill candidates, with before/after |
| [`.claude/skills/`](.claude/skills)                    | Custom Skills (see below)                                             |
| [`docs/plans/`](docs/plans)                            | Step-by-step plans approved by the Product Owner before any code      |
| [`docs/evidence/`](docs/evidence)                      | Verification results, screenshots and contract-test transcripts       |
| [`docs/contract-tests.md`](docs/contract-tests.md)     | Seven deliberate rule violations and how the agent stopped each one   |
| [`docs/sprint-1-review.md`](docs/sprint-1-review.md)   | Three-minute demo script for the Sprint Review                        |
| [`docs/sprint-1-retro.md`](docs/sprint-1-retro.md)     | Harness retrospective and the rules it added                          |
| [`docs/code-walkthrough.md`](docs/code-walkthrough.md) | Line-by-line explanation of the chat feature                          |

## Custom Skills

| Skill                                            | What it does                                                                                                                                                                                    | How to run it                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`new-route`](.claude/skills/new-route/SKILL.md) | Adds a new screen: a route, a feature folder with a typed view, a state hook (loading/error), an `api/` integration point and tests, then verifies it in headless Chrome. Nothing is committed. | In Claude Code: `/new-route knowledge (for B-06)`, or ask "add a screen for B-06 where…" |

The skill builds only what traces to a backlog item: name the item in the request. It passed three runs in a row in fresh sessions with no manual touch-ups ([evidence](docs/evidence/skill-new-route-reliability.md)). To run it headless in a folder you've never opened interactively, add `--allowedTools "Skill(new-route)"`.

Source layout (feature-based, see ADR-01):

```
src/
├── main.tsx
├── app/                      # shell, navigation, routes.ts (route table), not-found view
└── features/chat/
    ├── index.ts              # exports ChatScreen only
    ├── components/           # chat-screen, message-list, composer
    ├── hooks/                # use-chat (messages in memory), use-auto-scroll
    └── model/                # message.ts: types and pure functions

Screens added by new-route follow the same layout plus api/ (ADR-07).
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
