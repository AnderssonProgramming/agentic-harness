# Audit report

- Date: 2026-10-02
- Commit: f35e3e1
- Criteria: AUDIT-CRITERIA.md (25 checks)
- Checks run: audit:facts, verify:llm 10/10, verify:todos 19/19, verify:persistence 8/8, verify:chat 19/19

## Criteria

| ID      | Result | Evidence                                                                                                                                                                                                                            |
| ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01  | met    | `secrets.tracked`: 5 hits, all deliberate fakes: scripts/verify-llm.mjs:162 and its template line 162 pass `sk-ant-invalid-key-for-verify` to prove an invalid key gives `auth`; docs/contract-tests.md:38 is a refusal-test prompt |
| SEC-02  | met    | `secrets.history`: the same 3 fake strings (commits ea79ed4, 9137ed4, bd20ec1); no other key-shaped string in history                                                                                                               |
| SEC-03  | met    | `bundle.secrets` = [] with `realKeyChecked: true`; verify:llm `secrets` → clean                                                                                                                                                     |
| SEC-04  | met    | `env.envIgnored` true, `envEverCommitted` false, `exampleSecretsWithValues` []; the 7 example vars match every var read in server/llm/engine.ts:20-45                                                                               |
| IN-01   | met    | server/llm/history.ts:15-35 checks body shape, role, content type and last role; verify:llm `bad-request` passes                                                                                                                    |
| IN-02   | failed | No per-message limit on the server (server/llm/history.ts:30); the 4,000-char limit exists only in the browser (src/features/chat/model/message.ts:28)                                                                              |
| IN-03   | failed | No `dangerouslySetInnerHTML` or `innerHTML` in src/ (rendered as text); but stored to-do text has no length limit (src/features/todos/model/todo.ts:60)                                                                             |
| ERR-01  | met    | The UI renders only `describeChatError` (src/features/chat/components/reply-body.tsx:47), fixed sentences per code (src/shared/llm/errors.ts:50-81); to-do cards use fixed `cardTitle` text (src/features/todos/model/todo.ts:136)  |
| ERR-02  | met    | verify:chat C4 and B-05 (offline → Retry), verify:persistence blocked/full storage, verify:todos "Honest failure" ×2: all pass                                                                                                      |
| ERR-03  | met    | Only log is server/llm/handler.ts:143: code + error detail, built from status/provider body (server/llm/errors.ts:8), never the key or request messages                                                                             |
| LLM-01  | met    | `trimHistory` (server/llm/history.ts:43-68) applied at server/llm/handler.ts:112 with `historyChars: 24000` (server/llm/config.ts:11); the newest-turn exception (history.ts:61) is the IN-02 finding                               |
| LLM-02  | failed | Anthropic sends `max_tokens` (server/llm/engines/anthropic.ts:47); the Ollama body has no output cap (server/llm/engines/ollama.ts:25-29)                                                                                           |
| LLM-03  | met    | 429 → `rate_limit`, quota/credit → `quota` (server/llm/errors.ts:10-12); clear text (src/shared/llm/errors.ts:67-70); no automatic retry, Retry only on button click (reply-body.tsx:52, use-chat.ts:182-190)                       |
| LLM-04  | met    | One `streamReply` per send (src/features/chat/hooks/use-chat.ts:172); abort on Stop/unmount (use-chat.ts:178-180, 224-229); server aborts upstream on close (server/llm/handler.ts:98-100)                                          |
| LLM-05  | failed | System prompt is a constant and tool definitions are fixed, but the to-do list appended to `system` is unbounded (server/llm/todo-tools.ts:47, parsed without limits at server/llm/history.ts:6-12)                                 |
| LLM-06  | failed | No `usage` / token fields read anywhere in server/ or src/; the Anthropic stream parser ignores `message_start`/`message_delta` usage (server/llm/engines/anthropic.ts:73-115)                                                      |
| PER-01  | failed | Neither store limits or prunes: the conversation snapshot saves every message (src/features/chat/model/conversation-snapshot.ts:51), the to-do snapshot every to-do (src/features/todos/model/todo-snapshot.ts:68)                  |
| PER-02  | met    | Stores never throw and map failures to `full`/`unavailable` (src/features/chat/api/conversation-store.ts:48-54, src/features/todos/api/todo-store.ts:44-50); notice set at use-chat.ts:96-98; verify:persistence passes             |
| PER-03  | met    | Conversation at version 3 with migrations 1→2→3 (conversation-snapshot.ts:29-38), each tested (conversation-snapshot.test.ts:122, 131); to-dos at version 1, no past version                                                        |
| PERF-01 | failed | `MessageList` maps every message to plain `<li>` + `ReplyBody` with no `memo` (src/features/chat/components/message-list.tsx:33-45), so all items re-render on every chunk                                                          |
| PERF-02 | met    | Streamed text saved at most once per second via `saveSoon` (src/features/chat/hooks/use-chat.ts:35, 107-109, 137)                                                                                                                   |
| PERF-03 | met    | `bundle.jsGzipBytes` = 76,035 (< 150 KB)                                                                                                                                                                                            |
| DEP-01  | met    | `deps.unused` = []                                                                                                                                                                                                                  |
| DEP-02  | met    | `deps.audit`: 0 high, 0 critical (total 0)                                                                                                                                                                                          |
| DEP-03  | met    | `deps.licenses`: runtime `react`, `react-dom` both MIT                                                                                                                                                                              |

## Findings

| ID   | Criterion | File                                                | Risk   | Evidence                                                                                                                                                                                  | Proposed fix                                                                                                               |
| ---- | --------- | --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| F-01 | IN-02     | server/llm/history.ts:30                            | High   | `parseChatRequest` accepts any `content` length; `trimHistory` always keeps the newest turn even over budget (history.ts:61), so a client skipping the UI can send ~256 KB in one message | Reject a user turn longer than the shared 4,000-char limit with `bad_request` in `parseChatRequest`                        |
| F-02 | IN-03     | src/features/todos/model/todo.ts:60                 | High   | `addTodo` stores `text.trim()` with no length check; the text comes from the model's `add_todo` call (server/llm/todo-tools.ts:58), so any length reaches storage                         | Cap to-do text in one validation function (in `model/`) used by `addTodo`, and answer an over-long add with a card instead |
| F-03 | LLM-02    | server/llm/engines/ollama.ts:25                     | High   | The Ollama request body is `{ model, stream, messages }`: no `options.num_predict`; `maxOutputTokens` isn't passed to `ollamaEngine` (server/llm/engine.ts:38-41)                         | Pass `LLM_CONFIG.maxOutputTokens` to `ollamaEngine` and send it as `options: { num_predict }`                              |
| F-04 | LLM-05    | server/llm/todo-tools.ts:47                         | High   | `todoContext` joins every open to-do into the system prompt; `parseTodoRefs` (server/llm/history.ts:6-12) limits neither the count nor each text, only the 256 KB body does               | Bound the to-do context (max count and max chars per item) in `parseTodoRefs`, rejecting or truncating visibly             |
| F-05 | LLM-06    | server/llm/engines/anthropic.ts:73                  | Medium | The SSE loop handles only content blocks, errors and `message_stop`; `usage` in `message_start`/`message_delta` is discarded and nothing logs or forwards token counts                    | Read `usage` from `message_start`/`message_delta` and log input/output tokens per request (no message contents)            |
| F-06 | PER-01    | src/features/chat/model/conversation-snapshot.ts:51 | Medium | `toSnapshot` serializes the full message list on every save; nothing prunes, so the 10,000th message is still stored until `setItem` throws `full`                                        | Keep only the newest N messages (or N chars) in the snapshot, with a test                                                  |
| F-07 | PER-01    | src/features/todos/model/todo-snapshot.ts:68        | Medium | `toTodoSnapshot` stores every to-do, done ones included, with no cap                                                                                                                      | Cap the stored list (e.g. prune oldest done to-dos past a limit), with a test                                              |
| F-08 | PERF-01   | src/features/chat/components/message-list.tsx:33    | Medium | Each chunk replaces `messages`, and every `<li>`/`ReplyBody` re-renders; no `memo` or equivalent; React Compiler isn't in the approved dependencies                                       | Extract a memoized message item (`memo`) keyed by message object identity, so only the streaming reply re-renders          |

## Counts by risk

| Risk     | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 4     |
| Medium   | 4     |
| Low      | 0     |

## Observations outside the criteria

- Provider error bodies travel to the browser: the `error` event carries `failure.info.message` (server/llm/handler.ts:146), e.g. `anthropic HTTP 401: {"type":"error",...}` in verify:llm, and `failReply` keeps it in the stored conversation. It isn't rendered (ERR-01 is met), but it's visible in DevTools and localStorage.
- `npm run verify:chat -- <dir>` fails with `ENOENT` if the screenshot folder doesn't exist (scripts/verify-chat.mjs:10 doesn't create it). This run used the existing system temp folder.
- F-03 keeps the default High; note that Ollama is a local engine, so a runaway reply costs compute time, not money.
- `verify:persistence` takes no screenshots, so the temp-folder argument the audit skill passes to it has no effect.
