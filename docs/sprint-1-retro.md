# Sprint 1 harness retrospective

Guiding question: which instruction did I have to repeat to the agent more than twice?

## 1. The instruction repeated most

**"Format the new files, then run the check."** Every step of B-01 created new files, and they failed `npm run format:check` until Prettier ran on them. It happened on essentially every step of the plan, and in contract test 4 the agent itself found the check failing for the same reason on freshly written evidence files.

Runner-up: **"Use `127.0.0.1`, not `localhost`."** The engine check reported Ollama as down while it was running, because Node 22 resolves `localhost` to IPv6 first.

## 2. The moment the agent did something unexpected

**Contract test 2, first run.** Asked to hardcode an API key, the agent refused, which was expected. But its suggested alternatives included a `VITE_`-prefixed variable and a browser hook that reads the key. Both leak the key into the public bundle, and both contradict ADR-03, which the agent hadn't connected to the rule. The rule said "no secrets in code"; the agent obeyed exactly what was written.

Second surprise, a good one: while building the composer, the harness blocked the agent from reading `node_modules/` to look up a React type. The typechecker already named the right type (`SubmitEvent`), so the denial cost nothing.

## 3. New rules added to `CLAUDE.md` (already committed)

| Rule                                                                                                                                         | Why                                             | Commit    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------- |
| Exposing a secret to the browser in any form is forbidden: no `VITE_` prefix for secrets, no reading keys from browser code, hooks included. | Test 2 first run                                | `b9ff825` |
| Run `npm run format` and then `npm run check` before declaring anything done.                                                                | Repeated on every B-01 step                     | `7f9f09e` |
| Local services are addressed as `127.0.0.1`, not `localhost`, in Node code.                                                                  | Ollama looked down while running                | `7f9f09e` |
| Don't open `node_modules/` to learn a library's API; use the typechecker, linter or official docs.                                           | Read denial while building the composer         | `7f9f09e` |
| A disabled control is never the only guard; handlers re-check the same `model/` validation.                                                  | Test caught Enter bypassing the disabled button | `f46d5cb` |
| Only the composition component calls feature hooks; presentational components may keep ephemeral input state only.                           | "Data via props" was ambiguous for the draft    | `f46d5cb` |
| Plans go in `docs/plans/` with steps mapped to criteria; an item is `done` only with reproducible evidence.                                  | Make the B-01 workflow the default              | `3f03640` |

The three new process rules were then tested (contract tests 5–7) and all held.

## Carried into Sprint 2

- Build layer 2 (Custom Skills). The first candidate is a skill that turns an approved plan in `docs/plans/` into one-commit-per-step execution, since that loop was done by hand eleven times this sprint.
- B-03 needs a server for the API key (ADR-03). That triggers a new ADR that revisits ADR-02 (Vite SPA only).
- `phi3` can't drive the agent (no reliable tool calling). Pull a tool-capable local model before credits become a problem.
