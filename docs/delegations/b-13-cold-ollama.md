# Delegation: B-13 the local engine's first reply doesn't time out while the model loads

Status: approved by the PO on 2026-10-03 (as written).
Delegated to: the `feature-builder` subagent, in one bounded session. This contract **is** the plan.

## Context you need

- `BACKLOG.md`: item **B-13** only.
- `ARCHITECTURE.md`: the _Decision index_, then ADR-08, ADR-09 and ADR-13.
- `server/llm/chat-core.ts`, `server/llm/config.ts`, `server/llm/errors.ts`, `server/llm/engines/ollama.ts`, `server/llm/engines/types.ts`, and the tests next to them (`handler.test.ts`, `engine.test.ts`, `engines/engines.test.ts`).

## Decisions already made

1. **Two timeouts:** a **first-chunk timeout** (from the request to the first content chunk) and the existing **idle timeout** between chunks (20 s, unchanged).
2. The first-chunk timeout is **120 s for Ollama** and **30 s for Anthropic and the mock**. It lives in `config.ts` next to the idle timeout, overridable in tests like `idleTimeoutMs`.
3. Both end in the existing `timeout` error code (ADR-09). No protocol change.
4. Keep using `127.0.0.1` for Ollama (CLAUDE.md).

## Acceptance criteria

- [ ] A fake engine whose first chunk arrives after the idle timeout but before the first-chunk timeout **completes** with `done`. Evidence: deterministic test with fake timers or tiny injected timeouts.
- [ ] A fake engine that sends one chunk and then stalls past the idle timeout ends in `timeout`, exactly as today. Evidence: test.
- [ ] A fake engine that never sends a first chunk ends in `timeout` after the first-chunk timeout. Evidence: test.
- [ ] The typing indicator stays visible while waiting: the client keeps the pending state until the first chunk or the error. Evidence: an existing or new client-side test showing the pending state isn't cleared by elapsed time alone.
- [ ] **Live, cold:** with `INFERENCE_ENGINE=ollama`, after unloading the model (`ollama stop phi3`), the first reply completes. Run it from a **foreground** script or a test that starts and stops its own server, and record the elapsed time to the first chunk. Evidence: `docs/evidence/b-13-verification.md`.
- [ ] No regression: `npm run -s check`, `npm run verify:llm`.

## Limits

- No new dependencies. Don't modify `.claude/`, `CLAUDE.md`, the context files, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `netlify.toml`.
- Never run anything with `--debug` or `DEBUG`, never print environment variables, never start a server in the background. Don't read `.env`.
- One commit per step; set B-13 to `done` at the end, with the evidence file.

## Plan

Written by the `feature-builder` subagent.

| Step | What                                                                                                                                                                                                      | Files                                                                                                              | Criteria |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| 1    | Server: per-engine first-chunk timeout in `LLM_CONFIG`, overridable like `idleTimeoutMs`; the core waits for it until the first chunk, then the 20 s idle timeout. Tests.                                 | `server/llm/config.ts`, `server/llm/chat-core.ts`, `server/llm/errors.ts`, `server/llm/handler.test.ts`            | 1, 2, 3  |
| 2    | Client: `streamChat` waits a first-chunk timeout longer than the server's longest one before the first delta, then its 30 s idle timeout, so the indicator isn't cleared by time alone. Fake-timer tests. | `src/shared/llm/client.ts`, `src/shared/llm/client.test.ts`                                                        | 4        |
| 3    | Live cold run: a foreground script that unloads `phi3`, starts and stops its own Vite server on Ollama, and records the time to the first chunk. Evidence file, B-13 `done`.                              | `scripts/verify-cold-ollama.mjs`, `package.json` (script only), `docs/evidence/b-13-verification.md`, `BACKLOG.md` | 5, 6     |

## How you deliver

Commits with hashes; each criterion with its evidence; **"Decisions I made that this contract didn't cover"**; the final `check` result.
