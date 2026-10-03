# B-13 verification: the local engine's first reply doesn't time out while the model loads

Date: 2026-10-03. Delegation contract: `docs/delegations/b-13-cold-ollama.md`. Built by the `feature-builder` subagent.

## What changed

- **Server** (`server/llm/config.ts`, `server/llm/chat-core.ts`): until the engine's first chunk, the core waits `LLM_CONFIG.firstChunkTimeoutMs[engine]`: 120 s for Ollama, 30 s for Anthropic and the mock. After that, it waits the unchanged 20 s idle timeout between chunks. Both end in the existing `timeout` code. Tests can override the wait with `firstChunkTimeoutMs`, like `idleTimeoutMs`.
- **Browser** (`src/shared/llm/client.ts`): `streamChat` also restarted a 30 s idle timer on the `start` event, so it would have given up on a cold model long before the server did. Until the first `delta` or `action`, it now waits `DEFAULT_FIRST_CHUNK_TIMEOUT_MS` (150 s), then its 30 s idle limit. That's longer than every engine's server-side wait, so the server's typed `timeout` arrives first. A test enforces it.

## Criteria and evidence

| Criterion                                                                                       | Evidence                                                                                                                                                                                                        | Result |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A first chunk after the idle timeout but before the first-chunk timeout completes with `done`   | `server/llm/chat-core.test.ts`, "completes when the first chunk arrives after the idle timeout…" (fake timers: Ollama engine, first chunk at 90 s, nothing but `start` at 20.001 s, then `done`)                | Pass   |
| One chunk, then a stall past the idle timeout, ends in `timeout`                                | `server/llm/chat-core.test.ts`, "ends in timeout when an engine sends one chunk and then stalls…" (still streaming at 1 s + 19.999 s, `timeout` at 1 s + 20 s)                                                  | Pass   |
| No first chunk ends in `timeout` after the first-chunk timeout                                  | `server/llm/chat-core.test.ts`, "ends in timeout when %s never sends a first chunk…" for ollama (120 s), anthropic and mock (30 s): only `start` at limit − 1 ms, `timeout` at the limit                        | Pass   |
| The typing indicator stays visible: pending isn't cleared by elapsed time alone                 | `src/shared/llm/client.test.ts`, "streamChat waiting for the first chunk (B-13)": unsettled at 149.999 s with only `start`, then completes. Also `chat-core.test.ts`: the browser's wait exceeds every engine's | Pass   |
| Live, cold: with `INFERENCE_ENGINE=ollama`, after `ollama stop phi3`, the first reply completes | `npm run verify:cold-ollama` (foreground; starts and stops its own Vite server), three runs below                                                                                                               | Pass   |
| No regression                                                                                   | `npm run -s check`: 37 files, 340 tests passed. `npm run verify:llm`: 10 of 10 checks passed, three runs                                                                                                        | Pass   |

The pending state lives in `useChat` until `send` (that is, `streamChat`) settles. The hook has no timer of its own, so `streamChat` is where elapsed time could clear the pending state.

## Live cold runs (`npm run verify:cold-ollama`)

Each run calls `ollama stop phi3`, then confirms through Ollama's `/api/ps` that `phi3` isn't loaded. The endpoint answering is what shows the model could be listed. Then it sends one message through the real endpoint, with the real config timeouts, and checks afterwards that `/api/ps` lists `phi3`, which shows that this run loaded it.

| Run | Cold before | Time to first chunk | Total  | Last event | Loaded by the run |
| --- | ----------- | ------------------- | ------ | ---------- | ----------------- |
| 1   | yes         | 16.9 s              | 18.5 s | `done`     | yes               |
| 2   | yes         | 12.6 s              | 12.9 s | `done`     | yes               |
| 3   | yes         | 13.9 s              | 14.2 s | `done`     | yes               |

**Limit of this evidence.** On this machine and on this day, a cold `phi3` load stayed under the old 20 s idle timeout in all three runs. These runs show that a cold first reply completes, but they would also have passed before B-13. The "first chunk later than 20 s" path is proven by the deterministic tests above, not live. The week-6 timeouts happened at a load time this machine didn't reproduce today. Runs 2 and 3 were probably faster because the operating system still had the model file cached from run 1.
