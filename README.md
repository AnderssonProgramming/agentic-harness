# Compass

A conversational onboarding assistant for junior developers: it answers questions about a team's codebase and conventions during the first weeks on the job.

This repository is also an **AI harness**: the coding agent that builds Compass works under a written contract.

| File                                               | Purpose                                                        |
| -------------------------------------------------- | -------------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                           | Master context: the agent's role, rules and prohibitions       |
| [`.claude/settings.json`](.claude/settings.json)   | Enforced context exclusions and permissions                    |
| [`BACKLOG.md`](BACKLOG.md)                         | Prioritized product backlog with acceptance criteria           |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)               | Architecture decisions (ADRs) and the inference engine switch  |
| [`docs/contract-tests.md`](docs/contract-tests.md) | Evidence that the agent refuses instructions that break a rule |

> Sprint 1 status: the app shows local messages only. It does not call a language model yet.

## Requirements

- Node.js 22.12 or newer
- npm 11
- Optional, for the local fallback engine: [Ollama](https://ollama.com) with `ollama pull phi3`

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Commands

| Command                | What it does                                                  |
| ---------------------- | ------------------------------------------------------------- |
| `npm run dev`          | Start the dev server on port 5173                             |
| `npm run build`        | Typecheck and build for production into `dist/`               |
| `npm run preview`      | Serve the production build locally                            |
| `npm run check`        | Typecheck + lint + format check (must pass before any commit) |
| `npm run lint`         | ESLint only                                                   |
| `npm run format`       | Format all files with Prettier                                |
| `npm run engine:check` | Verify the active inference engine answers                    |

## Inference engine

Copy the example env file and fill in your key:

```bash
cp .env.example .env
```

- `INFERENCE_ENGINE=anthropic` (default) uses Claude and needs `ANTHROPIC_API_KEY`.
- `INFERENCE_ENGINE=ollama` uses local `phi3`; start it first with `ollama serve`.

Run `npm run engine:check` after switching. Full details, including how to point the coding agent itself at Ollama, are in [ARCHITECTURE.md](ARCHITECTURE.md#inference-engine).
