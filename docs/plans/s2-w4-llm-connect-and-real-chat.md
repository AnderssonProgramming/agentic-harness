# Plan: Sprint 2 week 4, items 2.3 to 2.5 (B-03, B-04, B-05, B-09)

Status: approved by the Product Owner on 2026-09-30 (as written).
Sources read: `CLAUDE.md`, `BACKLOG.md` (B-03, B-04, B-05, B-09), `ARCHITECTURE.md` (ADR-02, ADR-03, ADR-04, ADR-05, ADR-07), `docs/skills/llm-connect-design.txt`.

## Acceptance criteria

Sprint items:

- **2.3**: the skill generates the LLM client with error handling included, and passes three runs in a row with no touch-ups.
- **2.4**: a message is sent and the model's reply arrives, with a loading indicator and network-failure handling.
- **2.5**: a deliberately introduced compile error is detected and fixed by the agent on its own.

Week-4 chat criteria (C1–C6):

- **C1**: the model's reply arrives.
- **C2**: a visible loading indicator while waiting.
- **C3**: input locked while replying; no double send.
- **C4**: network down → understandable error, app keeps working.
- **C5**: at least five turns with context.
- **C6**: history kept while the app is open.

Backlog: B-03 (adapter, key server-side only, not in `dist/`), B-04 (Ollama by env, `engine:check`), B-05 (inline error with Retry, names the engine, user message kept), B-09 (streaming, first token < 2 s, Stop keeps partial text).

## Steps (one commit each)

| #   | Step                                                                                                                                                                                                                                                                    | Criteria         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | Commit the design and this plan; B-03, B-04, B-05, B-09 → `in progress`                                                                                                                                                                                                 | —                |
| 2   | ADR-08 (API handler mounted in Vite dev/preview, no server dependency), ADR-09 (one NDJSON event protocol; mock engine for tests); ADR-05 marked superseded by B-03                                                                                                     | —                |
| 3   | The skill: `.claude/skills/llm-connect/` (`SKILL.md`, generator, templates with tests, `verify-llm.mjs` template)                                                                                                                                                       | 2.3              |
| 4   | First real run on `main` for B-03: generate the connection, then review it by the Day-7 checklist (no secrets in code, `.env` ignored, `.env.example` complete)                                                                                                         | 2.3, B-03, B-04  |
| 5   | Reliability test: 3 runs in fresh clones (defaults / custom route and Ollama default / natural language), plus a negative run                                                                                                                                           | 2.3              |
| 6   | Chat model: message `status` (`streaming`, `done`, `error`, `stopped`) and pure functions to start, append to, finish, fail and retry a reply; drop the placeholder                                                                                                     | C5, C6, B-05     |
| 7   | `chat/api/chat-api.ts` (ADR-07) over the shared client; `useChat` streams replies, sends the whole history, blocks double sends, supports Stop and Retry                                                                                                                | C1, C3, C5, B-09 |
| 8   | UI: typing indicator, streaming text, inline error with Retry, Stop button, composer locked while replying                                                                                                                                                              | C2, C3, C4, B-05 |
| 9   | `verify:chat` on the mock engine: streaming, locked input, network offline (DevTools), rate-limit error + Retry, Stop, 50-message render; plus a live 5-turn conversation with Claude recorded as evidence                                                              | C1–C6, B-09      |
| 10  | Self-correction loop: in a fresh clone, break the build on purpose (a type error unrelated to the task), give the agent a normal approved task, and record whether it detects, reads the full error, fixes it and re-runs the check. Write the rule that makes it stick | 2.5              |
| 11  | Close out: `TASKS.md` (T-02 re-measured as the Skill 3 candidate, Skill 2 before/after), `CLAUDE.md` (skill listed, retro rule), backlog statuses, README, Sprint 2 review script and retro                                                                             | DoD              |

## Dependencies

None new. `fetch`, `ReadableStream` and `node:http` types are built into Node 22 and the browser; the server runs inside the already-approved Vite.

## Cost

Reliability runs and the live 5-turn test call the Anthropic API: about USD 2 in total at this sprint's measured rates. The browser tests use the mock engine and cost nothing.
