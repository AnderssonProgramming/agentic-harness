# llm-connect: reliability test

Criterion (Sprint 2, items 2.3 and 2.2's standard): the skill generates the LLM client with error handling, and **one command produces the complete result three times in a row with no manual touch-ups**.

Method, the same as for new-route:

1. A fresh clone with `npm ci`.
2. A fresh headless session: `claude -p "<invocation>" --allowedTools "Skill(llm-connect)" --output-format stream-json`.
3. **Independent re-verification by the harness:** `npm run check` and `npm run verify:llm`.

Each clone checks out the project as it was before the connection existed (`9137ed4`) and overlays the current `.claude/` and `CLAUDE.md`. Clones have no `.env`, so the `live` check reports `skipped`; the live Claude check ran on `main` (see below).

## Passing series (series 2): skill templates at `5cc70ad`

| Run | Condition                                                             | Invocation                                                                                                            | Agent time | Independent result                                                                          |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| 1   | Slash command, defaults; system prompt derived from CLAUDE.md         | `/llm-connect B-03`                                                                                                   | 213 s      | ✅ check 82/82 tests, verify:llm 10/10                                                      |
| 2   | Slash command, custom history budget and the user's own system prompt | `/llm-connect B-03 --history-chars 12000 --system "You are Compass, …"`                                               | 224 s      | ✅ check 82/82, verify 10/10; `historyChars: 12000`, prompt verbatim                        |
| 3   | Natural language with the persona in the user's words                 | "Connect the app to the model for B-03. The assistant should present itself as Compass, a patient onboarding helper…" | 219 s      | ✅ check 82/82, verify 10/10; called the Skill tool (call 9) before the generator (call 10) |

Each run had one permission denial, and none needed a human:

- **Runs 1–2:** `git check-ignore -v .env`, part of the skill's secrets checklist, wasn't in `allowed-tools`, so the agent checked `.gitignore` another way. It was added to the skill's `allowed-tools` and the project allow list **after** this series. That's an additive permission, and it isn't covered by a rerun.
- **Run 3:** an exploratory chained `cd … && git …` before the skill was invoked.

## First real use, on `main` (`ea79ed4`)

A fresh session in the trusted main folder with no extra flags, for B-03. check: 81 tests. verify:llm: 10/10, including **live**: Claude answered "Teal." from the history, first text after 1.45 s. The diff and secrets were reviewed before committing (see the commit message).

## Series 1 (templates at `9137ed4`): 2 of 3, and what it changed

| Run                                                                                         | Result                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 `/llm-connect B-03`                                                                       | ✅                                                                                                                                                                                                                                                          |
| 2 `/llm-connect B-04 --route api/converse --default-engine ollama --ollama-model llama3:8b` | Stopped, correctly: each option contradicts a recorded decision in this repo (ADR-08 route, B-03 default engine, B-04 default model). The test prompt was wrong, not the skill.                                                                             |
| 3 natural language                                                                          | ✅ independently, but the agent ran the generator **before** invoking the skill. It was denied, then the identical command was accepted once the skill was invoked. That led to the contract rule "invoke a skill before running its commands" (`5cc70ad`). |
| Negative: no item                                                                           | Stopped, listed the open items, changed nothing                                                                                                                                                                                                             |
| Negative: `B-01` (done)                                                                     | Stopped, quoted the rule, changed nothing                                                                                                                                                                                                                   |

Between the series, `verify:chat` found that mock error markers fired again after merged turns. The template was fixed (`4216f77`), which is why series 2 runs on newer templates.

## What the generated code covers

| Aspect                                       | Where                                                                   | Proven by                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Message structure (system, user, assistant)  | `server/llm/history.ts`; the system prompt stays on the server          | `history.test.ts`, verify `history`                                   |
| History: sent every call, trimmed when large | `trimHistory`                                                           | `history.test.ts` (budget, newest kept, merge)                        |
| Streaming                                    | `engines/anthropic.ts` (SSE), `engines/ollama.ts` (NDJSON), `client.ts` | engine tests, verify `stream`, verify:chat B-09                       |
| Network errors: timeout, offline, malformed  | `client.ts`, `handler.ts`, `lines.ts`                                   | `client.test.ts`, verify `unreachable`, verify:chat C4 (real offline) |
| API errors: invalid key, rate limit, quota   | `server/llm/errors.ts`                                                  | `engines.test.ts` (7 status mappings), verify `auth` (a real 401)     |
| Secrets in environment variables only        | `vite-plugin.ts` with `loadEnv`, no `VITE_`                             | verify `secrets` (production bundle scan)                             |
