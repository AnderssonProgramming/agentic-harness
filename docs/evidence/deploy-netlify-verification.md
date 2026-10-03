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

## Findings for the PO

1. **`/api/engine` counts against the rate limit.** The contract puts both routes in one Function (Decision 1), and Netlify applies a Function's `rateLimit` to all of its paths. Each page load spends 1 of the 6 requests per 3 minutes, so a visitor who reloads gets fewer chat turns. When it's limited, `fetchEngineInfo` returns `null` (engine unknown) and the chat still works. Splitting the routes into two Functions would fix it, but that changes Decision 1.
2. **The rate-limit message says "Wait a few seconds".** The platform window is up to 3 minutes. That copy is a product decision, so it wasn't changed.
3. **TECH-DEBT D-03 becomes due.** "When to fix: when the app is exposed to users other than its owner (after week 8's deployment)." Provider error bodies still reach the browser.
4. **There's no `netlify.toml`.** CLAUDE.md forbids editing deployment configuration, and the contract doesn't create that file. So the build command, publish directory and functions directory have to be set in the Netlify UI (see the delivery report). If they're missing, the first preview publishes the wrong folder. `verify:prod`'s `app-js` check catches that (an unbuilt `index.html` references `/src/main.tsx`, not a `.js` file).
