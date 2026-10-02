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

## Plan

Written by the `feature-builder` subagent. One commit per finding, in triage order.

| Step | Finding | Files                                                                                                                                                                                   | Criterion covered                                                           |
| ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | F-01    | new `src/shared/llm/limits.ts` (the three limits); `chat/model/message.ts` re-exports `MAX_MESSAGE_LENGTH` from it; `server/llm/history.ts` rejects a user turn over it; handler tests  | F-01: 4,001 → `bad_request`, engine not invoked; 4,000 passes               |
| 2    | F-04    | `server/llm/history.ts` `parseTodoRefs` rejects > 50 refs or a text > 200; `todos/model/todo.ts` `openRefs` sends the 50 newest open to-dos; handler and model tests                    | F-04: 50/51 refs, 200/201 chars, 60 open → 50 newest                        |
| 3    | F-02    | `todos/model/todo.ts` `checkTodoText` used by `addTodo`, new failure reason `too-long`; `todo-snapshot.ts` accepts it; conversation snapshot v3 → v4 (identity migration + test); tests | F-02: over-long add stores nothing, failure card says it's too long         |
| 4    | F-03    | `server/llm/engine.ts` passes `maxOutputTokens` to Ollama; `engines/ollama.ts` sends `options.num_predict`; engine test                                                                 | F-03: request body carries the cap                                          |
| 5    | F-05    | `engines/types.ts` (usage chunk), `anthropic.ts`, `ollama.ts`, `mock.ts` report usage; `handler.ts` logs one line on `done`; engine and handler tests                                   | F-05: one usage line per completed reply, provider numbers, no message text |
| 6    | all     | `npm run -s check`, `verify:llm`, `verify:todos`, `verify:persistence`, `verify:chat` (temp screenshot folder), `audit:validate`                                                        | No regression                                                               |

## Amendment 1 (after the second audit run, approved by the PO on 2026-10-02)

### Why

The second audit run (`docs/audit/2026-10-02-eeee42b.md`) found that two fixes can be bypassed. The PO confirmed both in the code:

- **IN-02:** the 4,000-character cap is checked per message, but `trimHistory` then merges consecutive user turns and always keeps the newest merged turn. So 60 back-to-back user messages of 4,000 characters reach the model as one turn of about 240,000 characters.
- **LLM-05:** count and text are bounded, but a to-do's `id` isn't, and it goes into the system prompt too.

**The original contract was wrong, not the implementation.** It specified limits on individual _elements_. What the PO needs is an **invariant about what reaches the model**, whatever shape the request takes.

### Acceptance criteria (invariants, with evidence)

- [ ] **IN-02 invariant:** for any accepted request, the total characters of the messages passed to the engine are at most `LLM_CONFIG.historyChars`, **including the newest turn after merging**. A request whose newest merged user turn alone exceeds the budget gets `bad_request`, and the model isn't called. A normal case must keep working: up to a few unanswered messages of 4,000 characters each, merged, within the budget.
- [ ] **LLM-05 invariant:** for any accepted request, everything the server **adds** to the prompt (the system prompt, the to-do context and the tool instructions) is at most a fixed, named bound, and the to-do `id` is bounded too. Pick the id limit to fit the app's real ids, e.g. UUIDs of 36 characters, and say what you chose. Anything over it gets `bad_request`, and the model isn't called.
- [ ] **Evidence:**
  - handler tests that reproduce **exactly** the two bypasses above (and fail on the current code before your fix);
  - **a property-style test that generates many request shapes** (counts, lengths, consecutive roles, ids) and asserts both invariants on what the engine receives, using a recording engine. Make it deterministic: a fixed seed or a fixed table, no randomness between runs.
- [ ] **No regression:** `npm run -s check`, and every `verify:*` with screenshots in a temp folder.

### Limits

The same as the original contract. One commit per bypass, naming the finding and the criterion, e.g. `fix(llm): bound the merged newest turn (F-01 bypass, IN-02)`. **Don't run the audit skill.**

### Plan (Amendment 1)

Written by the `feature-builder` subagent. Tests are written first and run against the current code to confirm they fail.

| Step | Bypass        | Files                                                                                                                                                                                                                                                 | Criterion covered                     |
| ---- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1    | F-01 (IN-02)  | `server/llm/history.ts` `trimHistory` throws `bad_request` when the newest merged turn alone exceeds the budget; `history.test.ts`; `handler.test.ts` (60 × 4,000 back-to-back → rejected; 5 × 4,000 → accepted and within budget)                    | IN-02 invariant, bypass reproduction  |
| 2    | F-04 (LLM-05) | `src/shared/llm/limits.ts` `MAX_TODO_ID_LENGTH` (36, a UUID); `history.ts` `parseTodoRefs` rejects longer ids; `todo-tools.ts` named bound on what the server adds + `systemWithTodos`; `anthropic.ts` uses it; `handler.ts` guard; tests             | LLM-05 invariant, bypass reproduction |
| 3    | both          | `server/llm/prompt-invariants.test.ts`: fixed-table property test over counts, lengths, consecutive roles and ids with a recording engine, asserting both invariants on what the engine receives (or that the engine isn't called when `bad_request`) | Property-style evidence               |
| 4    | all           | `npm run -s check`, every `verify:*` with screenshots in a temp folder                                                                                                                                                                                | No regression                         |
