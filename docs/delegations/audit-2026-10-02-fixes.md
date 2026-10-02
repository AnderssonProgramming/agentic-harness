# Delegation: fixes for audit findings F-01 to F-05

Status: approved by the PO on 2026-10-02 (as written).
Delegated to: the `feature-builder` subagent, in one bounded session.
Once approved, this contract **is** the plan (CLAUDE.md, "Delegation contracts").

## Context you need

Read only these:

- `AUDIT-REPORT.md`, section "Findings": F-01 to F-05, with their evidence and proposed fixes.
- `docs/audit/triage-2026-10-02.md`: the PO's decisions and order.
- `ARCHITECTURE.md`: the _Decision index_, then ADR-03, ADR-09 and ADR-11.
- **Server:** `server/llm/history.ts`, `server/llm/todo-tools.ts`, `server/llm/engine.ts`, `server/llm/engines/ollama.ts`, `server/llm/engines/anthropic.ts`, `server/llm/handler.ts`, `server/llm/config.ts`, and their tests.
- **Browser:** `src/features/chat/model/message.ts` (`MAX_MESSAGE_LENGTH`), `src/features/todos/model/todo.ts`, and the code that sends `todos` with a request (find it with `Grep "todos"` in `src/features/chat/`).

## Decisions already made (not up for discussion)

1. **One limit, defined once per value:**
   - 4,000 characters per message, the existing `MAX_MESSAGE_LENGTH`, now also enforced on the server;
   - **200 characters per to-do**;
   - **at most 50 open to-dos** sent with a request.

   Constants that both the server and the browser need live in `src/shared/llm/`, like the protocol.

2. **The server rejects what breaks a limit** with the existing `bad_request` error event. The protocol shape doesn't change (ADR-09).
3. **The browser never builds a request that breaks a limit.** It sends at most the **50 most recently added** open to-dos, so an ordinary user never sees the server's rejection.
4. **Token usage is logged on the server only:** one line per request with engine, model, input tokens and output tokens. **No message content and no keys** (ERR-03). No protocol change.

## Acceptance criteria (behavior, with evidence)

- [ ] **F-01:** a request whose user message is longer than 4,000 characters gets a `bad_request` error event, and the model isn't called. Evidence: a handler test that sends 4,001 characters and asserts the engine wasn't invoked, plus one at exactly 4,000 that passes.
- [ ] **F-04:** a request with more than 50 to-do refs, or any ref text over 200 characters, gets `bad_request`, and the model isn't called. The browser sends at most the 50 most recently added open to-dos. Evidence: handler tests at 50/51 refs and 200/201 characters, and a browser-side unit test with 60 open to-dos that sends 50 (the newest).
- [ ] **F-02:** adding a to-do longer than 200 characters stores nothing and shows a failure card that says it's too long. Evidence: an action-execution unit test that reads the store before and after.
- [ ] **F-03:** the Ollama request includes an output cap equal to `LLM_CONFIG.maxOutputTokens`. Evidence: an engine test that asserts the request body.
- [ ] **F-05:** after every completed reply, the server logs exactly one line, `[llm] usage engine=<e> model=<m> input=<n> output=<n>`, with the numbers the provider reported (Anthropic `message_start` and `message_delta`; Ollama `prompt_eval_count` and `eval_count`; the mock reports zeros). The line contains no message text. Evidence: engine and handler tests that capture the log.
- [ ] **No regression:**
  - `npm run -s check` passes;
  - `npm run verify:llm`, `verify:todos`, `verify:persistence` and `verify:chat` all pass, with screenshots in a temp folder;
  - `npm run audit:validate` passes on the existing report.

## Limits

- **No new dependencies.**
- **Don't modify:**
  - `.claude/`, `CLAUDE.md`, the `CONTEXT-*` files, `AUDIT-CRITERIA.md`, `AUDIT-REPORT.md`, `docs/audit/`, `TECH-DEBT.md`
  - the configuration files
  - any ADR
- **Don't fix F-06 or F-07:** they're documented debt (D-01, D-02). Don't fix the D-03 observation.
- **One commit per finding, in the triage order** (F-01, F-04, F-02, F-03, F-05). **Each commit message names its finding ID**, e.g. `fix(llm): reject over-long messages on the server (F-01, IN-02)`.
- Follow CLAUDE.md:
  - the self-correction loop
  - intermittent failures are findings
  - silently dropping user data or part of a request is a product question: stop and ask
  - foreground checks

## How you deliver

1. Commits with hashes, one per finding.
2. Each criterion: met or not met, with the test names and verify results.
3. Decisions I made that this contract didn't cover.
4. The final `npm run -s check` result.

**Don't run the audit skill.** The PO runs it after reviewing your work.
