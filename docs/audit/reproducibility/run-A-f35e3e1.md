# Audit report

- Date: 2026-10-02
- Commit: f35e3e1
- Criteria: AUDIT-CRITERIA.md (25 checks)
- Checks run: audit:facts, verify:llm 10/10, verify:todos 19/19, verify:persistence 8/8, verify:chat 19/19

## Criteria

| ID      | Result | Evidence                                                                                                                                                                                                       |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01  | met    | `secrets.tracked`: 5 hits, all deliberate fakes: scripts/verify-llm.mjs:162 and its template (invalid key for the `auth` check), docs/contract-tests.md:38 (a test prompt's fake key)                          |
| SEC-02  | met    | `secrets.history`: the same fake strings only (commits ea79ed4, 9137ed4, bd20ec1); no real key                                                                                                                 |
| SEC-03  | met    | `bundle.secrets` = [] with `realKeyChecked: true`; verify:llm `secrets` clean                                                                                                                                  |
| SEC-04  | met    | `env`: ignored, never committed, no secret with a value; the 7 variables read in server/llm/engine.ts:20-45 all appear in `.env.example`                                                                       |
| IN-01   | met    | server/llm/history.ts:15-35 checks shape, roles, content type and last role; handler.ts:111 caps body bytes; verify:llm `bad-request` pass                                                                     |
| IN-02   | failed | server/llm/history.ts:61-62 always keeps the newest turn whatever its length; only the 256,000-byte body cap applies (config.ts:15). The 4,000-char limit is UI-only                                           |
| IN-03   | failed | No `dangerouslySetInnerHTML`/`innerHTML` in `src/` (text rendered as text, e.g. message-list.tsx:40); but src/features/todos/model/todo.ts:60 stores to-do text with no length limit                           |
| ERR-01  | met    | UI renders only `describeChatError` (src/features/chat/components/reply-body.tsx:47; src/shared/llm/errors.ts:50-81) and fixed card texts (src/features/todos/model/todo.ts:152-155)                           |
| ERR-02  | met    | verify:chat C4 and B-05 (offline → Retry), verify:persistence blocked/full storage, verify:todos honest failure cards: all pass                                                                                |
| ERR-03  | met    | The only `console.*` in `server/` is server/llm/handler.ts:143: error code and message, built from provider error details (server/llm/errors.ts:8,24), never keys or request messages                          |
| LLM-01  | met    | server/llm/handler.ts:112 applies `trimHistory` with `historyChars: 24000` (server/llm/config.ts:11); the newest-turn exemption is covered by IN-02                                                            |
| LLM-02  | failed | Anthropic sends `max_tokens` (server/llm/engines/anthropic.ts:47); the Ollama request body (server/llm/engines/ollama.ts:25-29) has no `num_predict`                                                           |
| LLM-03  | met    | 429/quota/overloaded mapped (server/llm/errors.ts:10-13,29-38); clear texts (src/shared/llm/errors.ts:67-72); no retry in src/shared/llm/client.ts:74-126; Retry only via use-chat.ts:182-190                  |
| LLM-04  | met    | `startExchange` refuses while replying (src/features/chat/model/message.ts:56); retry guarded (use-chat.ts:185); unmount aborts (use-chat.ts:224-229); server aborts on close (server/llm/handler.ts:98-100)   |
| LLM-05  | failed | System prompt and tool definitions are constants (server/llm/todo-tools.ts:5-40), but the to-do list is appended whole with no count or text limit (server/llm/todo-tools.ts:47; server/llm/history.ts:6-11)   |
| LLM-06  | failed | No `usage`, `input_tokens`, `output_tokens` or `eval_count` read anywhere in `server/` or `src/`                                                                                                               |
| PER-01  | failed | Conversation saved whole with no pruning (src/features/chat/model/conversation-snapshot.ts:51); to-dos appended with no limit (src/features/todos/model/todo.ts:65)                                            |
| PER-02  | met    | Stores never throw and map failures (src/features/chat/api/conversation-store.ts:48-54; src/features/todos/api/todo-store.ts:44-51); notices shown (use-chat.ts:96-98); verify:persistence storage checks pass |
| PER-03  | met    | Chat snapshot v3 with migrations 1→2→3 tested (src/features/chat/model/conversation-snapshot.test.ts:122,131); to-dos at v1 with no past versions (src/features/todos/model/todo-snapshot.ts:4)                |
| PERF-01 | failed | src/features/chat/components/message-list.tsx:33-45 re-renders every item; neither the items nor `ReplyBody` (reply-body.tsx:12) are memoized                                                                  |
| PERF-02 | met    | Streamed text is saved at most every 1,000 ms (src/features/chat/hooks/use-chat.ts:35,107-109,137); only status changes save at once                                                                           |
| PERF-03 | met    | `bundle.jsGzipBytes` = 76,035 (< 150 KB)                                                                                                                                                                       |
| DEP-01  | met    | `deps.unused` = []                                                                                                                                                                                             |
| DEP-02  | met    | `deps.audit`: 0 high, 0 critical (0 total)                                                                                                                                                                     |
| DEP-03  | met    | `deps.licenses`: react and react-dom are MIT                                                                                                                                                                   |

## Findings

| ID   | Criterion | File                                                | Risk   | Evidence                                                                                                                                                                                                                                  | Proposed fix                                                                                                                       |
| ---- | --------- | --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | IN-02     | server/llm/history.ts:62                            | High   | `parseChatRequest` (history.ts:15-35) checks types only, and `trimHistory` keeps the newest turn "even if it alone exceeds the budget". A client that skips the UI can send one message of about 256,000 bytes straight to the model.     | In `parseChatRequest`, reject with `bad_request` any message over the UI's 4,000-character limit, shared from `src/shared/llm/`    |
| F-02 | IN-03     | src/features/todos/model/todo.ts:60                 | High   | `addTodo` stores `text.trim()` with no length check. The text comes from the model's `add_todo` call (server/llm/todo-tools.ts:58), so its length is unbounded.                                                                           | Cap to-do text in `addTodo` (or `actionFromToolUse`), and give the card a visible "too long" result instead of truncating silently |
| F-03 | LLM-02    | server/llm/engines/ollama.ts:25                     | Medium | The request body has `model`, `stream` and `messages` but no `options.num_predict`, so output is uncapped. Lowered from High because Ollama runs locally with no per-token billing: a runaway reply costs time and CPU, and Stop ends it. | Pass `options: { num_predict: LLM_CONFIG.maxOutputTokens }` in the Ollama request body                                             |
| F-04 | LLM-05    | server/llm/todo-tools.ts:47                         | High   | `todoContext` joins every open to-do into `system`; `parseTodoRefs` (server/llm/history.ts:6-11) accepts any number of any length. That puts an unbounded amount of text into every Anthropic call (anthropic.ts:45).                     | Bound the to-do context (maximum count and maximum characters) in `parseTodoRefs`, and reject with `bad_request` beyond it         |
| F-05 | LLM-06    | server/llm/engines/anthropic.ts:113                 | Medium | The SSE loop ignores `message_start` and `message_delta` `usage`, and returns at `message_stop` without recording tokens. No usage reaches the logs or the client.                                                                        | Read `usage.input_tokens` and `usage.output_tokens` from the stream, and log them per request (no message content)                 |
| F-06 | LLM-06    | server/llm/engines/ollama.ts:51                     | Low    | On `done: true` the final chunk's `prompt_eval_count` and `eval_count` are discarded. Lowered from Medium: the local engine has no billed cost, so this is a future improvement.                                                          | Read `prompt_eval_count` and `eval_count` from the final chunk and log them like Anthropic's usage                                 |
| F-07 | PER-01    | src/features/chat/model/conversation-snapshot.ts:51 | Medium | `toSnapshot` serializes every message ever kept. The 10,000th message is saved like the first, until `localStorage` fills and the "won't be saved" notice appears.                                                                        | Keep only the newest N messages (or N characters) in the snapshot, and tell the user when older ones are dropped                   |
| F-08 | PER-01    | src/features/todos/model/todo.ts:65                 | Medium | `addTodo` appends to the list with no maximum, and done to-dos are never pruned.                                                                                                                                                          | Cap the number of stored to-dos, and answer an add beyond it with a visible "list is full" card                                    |
| F-09 | PERF-01   | src/features/chat/components/message-list.tsx:33    | Medium | `messages.map` renders every `<li>` and `ReplyBody` on each delta, and neither is wrapped in `memo`. The cost is small today (verify:chat B-01 #5: 14.5 ms with 50 messages).                                                             | Extract a memoized message item (`memo`) keyed by message identity, so only the streaming reply re-renders                         |

## Counts by risk

| Risk     | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 3     |
| Medium   | 5     |
| Low      | 1     |

## Observations outside the criteria

- The NDJSON `error` event sends the provider's error details to the browser (server/llm/handler.ts:144-147, e.g. verify:llm `auth` detail with Anthropic's 401 body). The UI never renders it (ERR-01 met), but it is visible in the network tab.
- `verify:chat` doesn't create its screenshot folder (scripts/verify-chat.mjs:10). Given a nonexistent temp folder it fails with ENOENT after 4 checks, so this run used the git-ignored `dist/`.
- SEC-01 and SEC-02 will keep reporting the same three deliberate fakes on every run. An allowlist in `audit:facts` would make real leaks stand out.
- Criterion wording: LLM-06 and PER-01 each failed in two places (one per engine, one per store), so they produced two findings each.
