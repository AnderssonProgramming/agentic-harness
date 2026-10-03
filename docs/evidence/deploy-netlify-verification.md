# Deploy to Netlify: verification (Sprint 4, item 4.3)

Contract: `docs/delegations/deploy-netlify.md`. Recorded by the `feature-builder` subagent on 2026-10-02. Nothing was deployed. No login, link or site was created.

## Criteria

| Criterion                    | Status                   | Evidence                                                                                                                                                                           |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local production emulation   | **Not met (blocked)**    | The agent can't run the Netlify CLI: `npx` is on the `ask` list in `.claude/settings.json`, so a headless run denies it. The PO's command is below.                                |
| Same behavior as development | Met                      | `server/llm/handler.test.ts` is unchanged and passes against the shared core (ADR-13). `server/llm/netlify-function.test.ts` drives the Function's default export with `Request`s. |
| 429 is understood            | Met                      | `src/shared/llm/client.test.ts`: three kinds of plain 429 make `streamChat` reject with `rate_limit`, and `describeChatError` gives "Too many requests right now…".                |
| `verify:prod`                | Met (mechanism, locally) | `scripts/verify-prod.mjs`, run against `vite preview` on the mock engine (results below). Its numbers for the real platform come from the PO's first preview deploy.               |
| No regression                | Met                      | `npm run -s check`: 33 files, 300 tests. `verify:llm` 10/10, `verify:chat` 19/19, `verify:todos` 19/19. Screenshots went to the git-ignored `coverage/deploy-verify/`.             |

## `verify:prod` against a local build (mock engine)

`npm run build`, then `vite preview --mode mock` (port 4322, a git-ignored `.env.mock` with `INFERENCE_ENGINE=mock`, since removed), then:

- `npm run verify:prod -- http://127.0.0.1:4322` exited **0**:
  - `app-html` and `app-js` passed (one JS file, `text/javascript`);
  - `no-secrets` passed: 2 files scanned, 3 needles, real key checked;
  - `api-engine` passed: `mock/echo`, actions on;
  - `chat-short` passed: done in 503 ms;
  - `chat-full-length` passed: done in 1,122 ms.
- `npm run verify:prod -- http://127.0.0.1:4322 --rate-limit` exited **1**, as it should. Vite has no platform limit, so all 7 API requests got 200 and `rate-limit` failed. This shows the opt-in check fails when the limit is missing.

On the mock, the full-length check proves the mechanism only. Whether Netlify cuts a ~1,000-token Claude stream is measured by the first run against the draft URL.

## For the PO: local emulation (criterion 1)

The agent couldn't read `netlify --help`, so these flags come from the CLI's documented options and aren't verified here. `--dir dist` serves the built app with no Vite server, so `/api/*` can only be answered by the Function.

```powershell
npm run build
$env:INFERENCE_ENGINE = 'mock'
npx netlify dev --dir dist --offline
# in a second terminal:
npm run verify:prod -- http://localhost:8888
```

Expected: every check passes with `"engine": "mock"`.

## Amendment 1 (second pass, 2026-10-02)

| Criterion                                   | Status      | Evidence                                                                                                                                                                                                                                  |
| ------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `netlify.toml` holds every build setting    | Met         | `netlify.toml`: `npm run build`, `dist`, `netlify/functions`, `NODE_VERSION = "22"`. `netlify serve` reported `commandOrigin: config` and `publishOrigin: config`. The README's "Deploy (Netlify)" section has no UI build-settings step. |
| Two Functions, each with its own rule       | Met         | `netlify/functions/chat.ts` (6 per 180 s) and `engine.ts` (60 per 180 s). `server/llm/netlify-function.test.ts` checks both configs, and that their paths equal `LLM_CONFIG.route` and `LLM_CONFIG.engineRoute`.                          |
| Rate-limit text                             | Met         | `describeChatError` now says "…Wait a couple of minutes and try again."; `client.test.ts` asserts it, and `verify:chat` shows it in the browser.                                                                                          |
| `serve:prod` + `verify:prod` locally (mock) | **Blocked** | See below.                                                                                                                                                                                                                                |
| No regression                               | Met         | `npm run -s check`: 33 files, 300 tests. `verify:llm` 10/10, `verify:chat` 19/19, `verify:todos` 19/19, with screenshots in the git-ignored `coverage/deploy-verify-a1/`.                                                                 |

### Why `serve:prod` + `verify:prod` is blocked

`npm run serve:prod -- --port 8888` (= `netlify serve --offline`) needs no login or linked site. It builds with `netlify.toml` and serves `dist/` plus the Functions. Two things stopped the run on the mock:

1. **It uses the engine in `.env`, not the mock.** The CLI logs `Injected .env file env vars: INFERENCE_ENGINE, ANTHROPIC_API_KEY, …`. In this session the engine there is `anthropic` with a real key. The headless permissions deny an inline override (`INFERENCE_ENGINE=mock npm run …`), so `verify:prod` would have spent real Claude requests. It wasn't run.
2. **It doesn't listen on `127.0.0.1`.** `verify:prod -- http://127.0.0.1:8888` got `fetch failed` on every check while the server was up (it held its port 3999). It most likely binds `localhost` → `::1` only, which is the reverse of CLAUDE.md's Ollama note. The agent couldn't confirm this, because `curl` and process tools need approval.

Superseded by Amendment 2 (below): run `npm run verify:prod:local`. Don't use the earlier two-terminal recipe: it served the Functions with the real `.env` key.

## Amendment 2 (third pass, 2026-10-02)

| Criterion                                                                                   | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invariant: the served Functions never get a non-empty `ANTHROPIC_API_KEY`; engine is `mock` | Met    | `scripts/serve-prod-env.test.mjs` runs every combination of 9 parent environments × 12 argument lists (a real-looking key in the parent env under two casings, in the args, `DEBUG=*`, `NODE_DEBUG`, `--debug`, `--auth`, `--context`…). Each one is refused, or it gets an empty key, `INFERENCE_ENGINE=mock` and no debug variable. `verify:prod:local` reports `"engine": "mock"`, and the CLI lists `ANTHROPIC_API_KEY` under _ignored_ `.env` variables (defined in process), not under _injected_. |
| `verify:prod:local` passes on the mock, and nothing listens on its ports afterwards         | Met    | Output below, at commit `8fd1eaf`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `serve:prod -- --debug` exits non-zero without starting                                     | Met    | `scripts/serve-prod-env.test.mjs`: it spawns `scripts/serve-prod.mjs --debug` and expects exit 2, `"--debug" is refused` on stderr and nothing on stdout. A second test does the same with `DEBUG=*` in the environment.                                                                                                                                                                                                                                                                                 |
| No regression                                                                               | Met    | `npm run -s check`: 34 files, 311 tests. `verify:llm` 10/10. `verify:chat -- coverage/deploy-verify-a2` 19/19 (git-ignored folder, no tracked file changed).                                                                                                                                                                                                                                                                                                                                             |

### `npm run -s verify:prod:local` (mock engine)

Its own checks, verbatim:

```json
[
  {
    "id": "site-up",
    "pass": true,
    "detail": { "url": "http://localhost:59807/", "startupMs": 13254, "exitedBeforeUp": null }
  },
  { "id": "verify-prod", "pass": true, "detail": { "exitCode": 0 } },
  { "id": "engine-mock", "pass": true, "detail": { "engine": "mock" } },
  {
    "id": "no-secret-injected",
    "pass": true,
    "detail": {
      "injectedFromDotEnv": ["NODE_VERSION", "ANTHROPIC_MODEL", "OLLAMA_BASE_URL", "OLLAMA_MODEL"],
      "ignoredFromDotEnv": ["INFERENCE_ENGINE", "ANTHROPIC_API_KEY"],
      "injectedSecrets": []
    }
  },
  {
    "id": "ports-closed",
    "pass": true,
    "detail": {
      "port": 59807,
      "functionsPort": 59808,
      "stillListening": { "port": false, "functionsPort": false }
    }
  }
]
```

The `verify:prod` report it ran: `app-html` ✓, `app-js` ✓ (1 file), `no-secrets` ✓ (2 files scanned, 3 needles, real key checked, no leaks), `api-engine` ✓ (`{"engine":"mock","model":"echo","actions":true}`), `chat-short` ✓ (34 events, `done`), `chat-full-length` ✓ (74 events, `done`, 2.5 s). Exit code 0.

On the mock, `chat-full-length` only proves the stream reaches `done`: the echo reply is 414 characters. The platform's real stream limit can only be measured by `verify:prod` against a deployed URL with Claude.

## Findings for the PO

0. **Second pass: the real Anthropic key was written to a local log.** A diagnostic `netlify serve --debug` sets `DEBUG=*`, and Vite's debug logger printed the resolved environment, key included, into the agent's background-task output file in the user temp folder (`AppData/Local/Temp/claude/…/tasks/bnjyn7vat.output`). It's outside the repository. Nothing was committed and nothing was sent anywhere. Delete that file and consider rotating the key. Never run `serve:prod` with `--debug` when `.env` holds a real key.

First-pass findings 1, 2 and 4 are resolved by Amendment 1. Finding 3 was re-deferred by the PO.

1. **`/api/engine` counts against the rate limit.** The contract puts both routes in one Function (Decision 1), and Netlify applies a Function's `rateLimit` to all of its paths. Each page load spends 1 of the 6 requests per 3 minutes, so a visitor who reloads gets fewer chat turns. When it's limited, `fetchEngineInfo` returns `null` (engine unknown) and the chat still works. Splitting the routes into two Functions would fix it, but that changes Decision 1.
2. **The rate-limit message says "Wait a few seconds".** The platform window is up to 3 minutes. That copy is a product decision, so it wasn't changed.
3. **TECH-DEBT D-03 becomes due.** "When to fix: when the app is exposed to users other than its owner (after week 8's deployment)." Provider error bodies still reach the browser.
4. **There's no `netlify.toml`.** CLAUDE.md forbids editing deployment configuration, and the contract doesn't create that file. So the build command, publish directory and functions directory have to be set in the Netlify UI (see the delivery report). If they're missing, the first preview publishes the wrong folder. `verify:prod`'s `app-js` check catches that (an unbuilt `index.html` references `/src/main.tsx`, not a `.js` file).

## Amendment 2: the PO's independent verification (2026-10-02)

Run by the PO session, not taken from the subagent's report.

| Check                                                                           | Result                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run -s check`, 3 times in a row                                            | 3/3 passed, 311 tests each                                                      |
| `npm run -s verify:prod:local` **under load** (`npm test` running concurrently) | exit 0                                                                          |
| `npm run -s verify:prod:local`, idle                                            | exit 0; `"engine": "mock"`, `injectedSecrets: []`, both ports closed afterwards |
| Real-key shapes in either run's output                                          | 0                                                                               |
| `npm run -s serve:prod -- --debug` (Bash)                                       | refused, exit 2, no server started                                              |
| `DEBUG='*' npm run -s serve:prod` (Bash)                                        | refused, exit 2                                                                 |
| `netlify` processes or listeners on 8888/3999 after the runs                    | none                                                                            |

**Finding (Low):** from **PowerShell**, `npm run serve:prod -- --debug` loses the `--`, so npm consumes `--debug` and the wrapper starts normally. The secrets were still blanked (the CLI reported `ANTHROPIC_API_KEY` as _ignored, defined in process_). But the server had to be stopped by hand. `verify:prod:local` takes no arguments, so it's the documented way to run production locally, and it always stops its server.

**The leak's footprint:** the real key was in 3 local files, counted against `.env` without printing it:

- the task log from the `--debug` run, now deleted;
- the PO's copy of the subagent transcript, now deleted;
- Claude Code's own history of that subagent session, left for the PO to decide.

Every other key-shaped string in local transcripts is a deliberately fake test fixture. **The key must be rotated before the first deployment.**
