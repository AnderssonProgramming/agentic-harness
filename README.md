# Compass

A conversational onboarding assistant for junior developers: it answers questions about a team's codebase and conventions during the first weeks on the job.

This repository is also an **AI harness**: the coding agent that builds Compass works under a written contract, and every item it delivers comes with a plan, tests and recorded evidence.

> **Status (end of Sprint 2):** Compass talks to a real model. Replies stream in as they're written, the conversation keeps its context, and network and API failures show a clear message with Retry. Two Custom Skills (`new-route`, `llm-connect`) each turn a multi-step task into one command, and both passed the three-runs-in-a-row reliability test.

![Compass answering on turn 5 from what it was told on turns 1 and 2](docs/evidence/b-03-live-conversation.png)

## Quick start

Requirements: Node.js 22.12 or newer (includes npm), and Git.

```bash
git clone https://github.com/AnderssonProgramming/agentic-harness.git
cd agentic-harness
npm install
cp .env.example .env
npm run dev
```

Then pick an engine in `.env`, and open http://localhost:5173:

| You have…                                | Set in `.env`                                        | Notes                                                                  |
| ---------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| An Anthropic API key                     | `ANTHROPIC_API_KEY=sk-ant-…` (default engine)        | Recommended. The key stays on the server and never reaches the browser |
| No key, but [Ollama](https://ollama.com) | `INFERENCE_ENGINE=ollama` (after `ollama pull phi3`) | Local and private; slower on CPU                                       |
| Neither, or you're offline               | `INFERENCE_ENGINE=mock`                              | No model: echoes your message. For trying the UI and for tests         |

Restart `npm run dev` after changing `.env`. If the key is missing, the chat says so instead of failing silently.

## Commands

| Command                                    | What it does                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                              | Start the dev server on port 5173                                                                                     |
| `npm run check`                            | Typecheck + lint + format check + tests. Must pass before any commit                                                  |
| `npm test`                                 | Run the unit and component tests once (Vitest + Testing Library)                                                      |
| `npm run verify:chat`                      | Check the chat in headless Chrome on the mock engine: streaming, Stop, offline error, Retry, 5 turns (19 checks) [^1] |
| `npm run verify:chat -- --live`            | Five real turns with the engine in `.env`: context and time to first text [^1]                                        |
| `npm run verify:llm`                       | Check the chat endpoint: stream, history, every error code, a real 401, secrets in the bundle                         |
| `npm run verify:route -- <path> "<title>"` | Check that a route loads by URL and by nav click in headless Chrome [^1] [^2]                                         |
| `npm run format`                           | Format all files with Prettier                                                                                        |
| `npm run lint`                             | ESLint only                                                                                                           |
| `npm run build`                            | Typecheck and build for production into `dist/`                                                                       |
| `npm run preview`                          | Serve the production build locally                                                                                    |
| `npm run engine:check`                     | Verify the configured inference engine answers (needs `.env`, see below)                                              |

[^1]: Uses the installed Google Chrome. If it's not at the default Windows path, set `CHROME_PATH`. Set `APP_URL` to check an already-running server instead of starting one.

[^2]: Pass the path without the leading slash (`knowledge`, not `/knowledge`): Git Bash on Windows rewrites arguments that start with `/`.

## How the harness is organized

| File                                                                             | Purpose                                                               |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                                         | Master context: the agent's role, rules and prohibitions              |
| [`.claude/settings.json`](.claude/settings.json)                                 | Enforced context exclusions and permissions                           |
| [`BACKLOG.md`](BACKLOG.md)                                                       | Prioritized product backlog with acceptance criteria                  |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                                             | Folder map, architecture decisions (ADR-01 to ADR-09), engine switch  |
| [`TASKS.md`](TASKS.md)                                                           | Repeated tasks measured as Custom Skill candidates, with before/after |
| [`.claude/skills/`](.claude/skills)                                              | Custom Skills (see below)                                             |
| [`docs/plans/`](docs/plans)                                                      | Step-by-step plans approved by the Product Owner before any code      |
| [`docs/evidence/`](docs/evidence)                                                | Verification results, screenshots and contract-test transcripts       |
| [`docs/contract-tests.md`](docs/contract-tests.md)                               | Deliberate rule violations and how the agent stopped each one         |
| [`docs/evidence/self-correction-loop.md`](docs/evidence/self-correction-loop.md) | A deliberate compile error and how the agent detected and fixed it    |
| [`docs/sprint-2-review.md`](docs/sprint-2-review.md)                             | Three-minute demo script for the Sprint 2 Review                      |
| [`docs/sprint-2-retro.md`](docs/sprint-2-retro.md)                               | Sprint 2 harness retrospective                                        |
| [`docs/sprint-1-review.md`](docs/sprint-1-review.md)                             | Three-minute demo script for the Sprint Review                        |
| [`docs/sprint-1-retro.md`](docs/sprint-1-retro.md)                               | Harness retrospective and the rules it added                          |
| [`docs/code-walkthrough.md`](docs/code-walkthrough.md)                           | Line-by-line explanation of the chat feature                          |

## Custom Skills

| Skill                                                | What it does                                                                                                                                                                                                                                                 | How to run it                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [`new-route`](.claude/skills/new-route/SKILL.md)     | Adds a new screen: a route, a feature folder with a typed view, a state hook (loading/error), an `api/` integration point and tests, then verifies it in headless Chrome. Nothing is committed.                                                              | In Claude Code: `/new-route knowledge (for B-06)`, or ask "add a screen for B-06 where…" |
| [`llm-connect`](.claude/skills/llm-connect/SKILL.md) | Generates the conversational connection: a server-side endpoint (keys never in the browser), Anthropic, Ollama and mock engines, streaming, history trimming, a typed client with every error mapped, about 50 tests and `verify:llm`. Nothing is committed. | `/llm-connect B-03`, or ask "connect the app to the model for B-03"                      |

Both skills build only what traces to a backlog item: name the item ID in the request. Both passed three runs in a row in fresh sessions with no manual touch-ups ([new-route](docs/evidence/skill-new-route-reliability.md), [llm-connect](docs/evidence/skill-llm-connect-reliability.md)). To run one headless in a folder you've never opened interactively, add `--allowedTools "Skill(<name>)"`.

Source layout (feature-based, see ADR-01):

```
src/
├── main.tsx
├── app/                      # shell, navigation, routes.ts (route table), not-found view
├── shared/llm/               # wire protocol, error codes, streamChat client (ADR-09)
└── features/chat/
    ├── index.ts              # exports ChatScreen only
    ├── api/                  # chat-api.ts: the chat's way out to the model (ADR-07)
    ├── components/           # chat-screen, message-list, reply-body, composer
    ├── hooks/                # use-chat (streaming, stop, retry), use-auto-scroll
    └── model/                # message.ts: reply lifecycle as pure functions
server/llm/                   # server only: endpoint, engines, keys (ADR-08)

Screens added by new-route follow the same layout plus api/ (ADR-07).
```

## Inference engine

`INFERENCE_ENGINE` in `.env` picks the engine at startup, with no code change (B-04, ADR-03). It can be `anthropic` (default), `ollama` or `mock`. `npm run engine:check` reports which one is active and whether it answers. The server streams every engine through the same protocol, so the chat doesn't know which one replied (ADR-09).

Details, including how to point the coding agent itself at Ollama, are in [ARCHITECTURE.md](ARCHITECTURE.md#inference-engine).

## Troubleshooting

- **Port 5173 is already in use:** the dev server uses `strictPort`, so it fails instead of silently moving. Stop the other process or run `npm run dev -- --port 5174`.
- **The chat says "The assistant isn't configured yet":** `ANTHROPIC_API_KEY` is empty in `.env`. Add it, or switch `INFERENCE_ENGINE`, then restart `npm run dev`.
- **"Claude rejected the API key":** the key in `.env` is wrong or revoked. Check it in the Anthropic console.
- **`engine:check` says Ollama is not running while it is:** make sure `OLLAMA_BASE_URL` uses `127.0.0.1`, not `localhost` (Node 22 tries IPv6 first).
