# Audit criteria

The checklist the `audit` skill runs against. It was written **before** any audit run, from the product's promises (the BACKLOG criteria, the ADRs, CLAUDE.md), the guide's seven areas, and the Web-track focus. It was not written from reading the code.

Rules for the auditor:

- Every criterion appears in every report, as **met** or **failed**.
- **Don't add criteria.** If you notice something outside this list, put it under "Observations outside the criteria". Never put it in the findings table.
- "How to check" is the method. Use it, so two runs can be compared.
- "Risk if failed" is the default classification. Change it only with a written reason in the finding.

Facts that a script can establish come from `npm run audit:facts`, which outputs JSON. Everything else is read in the code, citing **file and line**.

## Secrets (SEC)

| ID     | Check                                                                                                                         | How to check                                                                                                                                      | Risk if failed |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| SEC-01 | No API keys, tokens or private keys in tracked files                                                                          | `audit:facts` → `secrets.tracked` (key patterns over `git ls-files`). Each hit is judged: a fake fixture used by a test isn't a leak, but say why | Critical       |
| SEC-02 | No real key anywhere in the git history                                                                                       | `audit:facts` → `secrets.history` (key patterns over `git log -p --all`)                                                                          | Critical       |
| SEC-03 | The production browser bundle contains no key names or key values                                                             | `audit:facts` → `bundle.secrets` (a production build scanned for `ANTHROPIC_API_KEY`, `sk-ant-` and the real key if one is set)                   | Critical       |
| SEC-04 | `.env` is git-ignored and was never committed; `.env.example` lists every variable the server reads, with empty secret values | `audit:facts` → `env`; compare with the variables read in `server/llm/engine.ts`                                                                  | High           |

## User input (IN)

| ID    | Check                                                                                                                                                  | How to check                                                                                                | Risk if failed |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------- |
| IN-01 | The chat endpoint validates the request body (shape, roles, types) and answers malformed input with an error, without crashing                         | Read the request parsing in `server/llm/`; `verify:llm` → `bad-request`                                     | High           |
| IN-02 | Message length is limited **on the server**, not only in the UI. A client that skips the UI can't send arbitrarily long messages to the model          | Read the server-side request handling for a per-message or total length limit, beyond the raw body size     | High           |
| IN-03 | Text from the user or the model that's stored or shown (messages, to-dos) is rendered as text, never as HTML, and stored to-do text has a length limit | Search `src/` for `dangerouslySetInnerHTML` and `innerHTML`; read the to-do store's handling of text length | High           |

## Error handling (ERR)

| ID     | Check                                                                                                                           | How to check                                                                                                     | Risk if failed |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------- |
| ERR-01 | No failure shows internal details to the user (stack traces, provider error bodies, file paths, keys)                           | Read what the UI renders on error: `describeChatError` and the action cards. Provider messages must stay in logs | High           |
| ERR-02 | No failure leaves the app unusable: after a network, engine, storage or action failure, the user can still send and get replies | `verify:chat` (offline → Retry), `verify:persistence` (blocked or full storage), `verify:todos` (failure cards)  | High           |
| ERR-03 | Server logs never print keys or the request's message contents                                                                  | Read every `console.*` call in `server/`                                                                         | Medium         |

## Model consumption (LLM)

| ID     | Check                                                                                                                                 | How to check                                                                                    | Risk if failed |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------- |
| LLM-01 | The history sent per request has an enforced size limit                                                                               | Read the trimming in `server/llm/`, and where it's applied                                      | High           |
| LLM-02 | Every model request has an output-token cap                                                                                           | Read each engine's request body (`max_tokens` or the equivalent)                                | High           |
| LLM-03 | Rate-limit and quota errors are recognized, shown clearly, and **never retried automatically**                                        | Read the error mapping and the client's retry paths (Retry must be the user's action)           | High           |
| LLM-04 | One user send causes at most one model request, and replies are cancelled when the user stops or leaves                               | Read `useChat` send, retry and unmount; the handler's abort on disconnect                       | Medium         |
| LLM-05 | Everything **added** to the prompt besides the trimmed history (the system prompt, the to-do list, tool definitions) has a size limit | Read what the handler and engines add to `system` and to tool context, and whether it's bounded | High           |
| LLM-06 | The cost of a conversation can be measured (token usage reaches the logs or the client)                                               | Read whether usage from the provider responses is recorded anywhere                             | Medium         |

## Persistence (PER)

| ID     | Check                                                                                   | How to check                                                                 | Risk if failed |
| ------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------- |
| PER-01 | Stored data has a size limit or pruning, so it can't grow until browser storage is full | Read the conversation and to-do stores: what happens to the 10,000th message | Medium         |
| PER-02 | A failed storage write never crashes the app, and the user is told                      | `verify:persistence` (blocked, full); read the stores' error paths           | High           |
| PER-03 | Stored formats are versioned, and every past version has a tested migration             | Read the snapshot modules and their tests                                    | Medium         |

## Performance (PERF)

| ID      | Check                                                                                                                                    | How to check                                                                                                  | Risk if failed |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------- |
| PERF-01 | During streaming, finished messages don't re-render on every chunk                                                                       | Read `MessageList` and its items: memoized items or an equivalent. A render count, if measured, beats reading | Medium         |
| PERF-02 | No heavy synchronous work runs per streamed chunk on the main thread (e.g. serializing the whole conversation to storage on every chunk) | Read the save cadence in `useChat`                                                                            | Medium         |
| PERF-03 | The production JavaScript is under 150 KB gzipped                                                                                        | `audit:facts` → `bundle.jsGzipBytes`                                                                          | Medium         |

## Dependencies (DEP)

| ID     | Check                                                                         | How to check                               | Risk if failed                      |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| DEP-01 | Every declared dependency is used                                             | `audit:facts` → `deps.unused`              | Low                                 |
| DEP-02 | No known vulnerability of high or critical severity in the dependency tree    | `audit:facts` → `deps.audit` (`npm audit`) | High (critical advisory → Critical) |
| DEP-03 | Every runtime dependency has a permissive license (MIT, ISC, BSD, Apache-2.0) | `audit:facts` → `deps.licenses`            | Medium                              |

**Total: 25 checks.**
