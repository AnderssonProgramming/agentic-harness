# Delegation: deploy Compass to Netlify (Sprint 4, item 4.3)

Status: approved by the PO on 2026-10-02 (as written).
Delegated to: the `feature-builder` subagent, in one bounded session.
Once approved, this contract **is** the plan.

## Context you need

- `ARCHITECTURE.md`: the _Decision index_, then ADR-03, ADR-08, ADR-09 and ADR-11.
- **Server:** `server/llm/handler.ts`, `server/llm/vite-plugin.ts`, `server/llm/config.ts`, `server/llm/engine.ts`.
- **Shared:** `src/shared/llm/client.ts` and `src/shared/llm/errors.ts`, for how the client turns responses into error codes.
- `package.json`, `.env.example`, and `scripts/audit-facts.mjs`, for how the bundle is scanned for secrets.
- `TECH-DEBT.md`: D-03 and D-07 only. `docs/audit/accepted-risks.md`.
- `npx netlify --help`, and its subcommands' help, for the installed `netlify-cli` 27. It's in devDependencies; don't look it up in `node_modules`.

## Decisions already made (not up for discussion)

1. **Netlify, two parts:**
   - the static app from `npm run build` (`dist/`);
   - **one** Netlify Function (the modern format: a default export taking a `Request` and returning a `Response`), serving `/api/chat` and `/api/engine` through its `config.path`.
2. **One handler for local development and production.** The function is a thin adapter over the existing chat handler logic in `server/llm/`, so local `npm run dev` and production run the same validation, limits, engines and NDJSON protocol (ADR-08, ADR-09). Don't fork the logic. If the current `(req, res)` shape prevents a clean adapter, refactor `server/llm/` so both entry points share one core. Record that as ADR-13.
3. **The response streams:** a `Response` with a `ReadableStream` body, `content-type: application/x-ndjson`.
4. **Secrets come from Netlify's environment** (`process.env` / `Netlify.env`), never from files. The production default engine is `anthropic`. `.env.example` gains a short "Production (Netlify)" note listing which variables must be set in the Netlify UI.
5. **Abuse limits** (PO decision: Claude, plus limits, plus a spend cap):
   - The chat route uses **Netlify's platform rate limiting** in its `config`: `rateLimit: { windowLimit: 6, windowSize: 180, aggregateBy: ["ip", "domain"] }`, which is 6 requests per 3 minutes per visitor. The free plan allows 2 rules, and a window can be at most 180 s (Netlify docs).
   - A platform-limited request gets a plain **HTTP 429**. The **browser client must map any HTTP 429 to the existing `rate_limit` error code**, so the user sees "Too many requests…", not "incomplete".
   - A global daily cap isn't available on the free plan. **The PO sets a monthly spend limit in the Anthropic console**: that's the backstop. Document it, don't code it.
6. **Commands:**
   - `npm run deploy:preview` = `netlify deploy --build`, a draft URL;
   - `npm run deploy:prod` = `netlify deploy --build --prod`;
   - `npm run verify:prod -- <url>`, the production smoke check below.

   No other deploy path.

## Acceptance criteria

- [ ] **Local production emulation works.** `npx netlify dev`, or `netlify serve` on the build, serves the app and the function: a chat request streams `start` → deltas → `done` with `INFERENCE_ENGINE=mock`. Evidence: the command and its result.
- [ ] **Same behavior as development.** The existing handler tests pass unchanged against the shared core. One new test drives the **Function entry point** with a `Request` and checks:
  - the NDJSON stream;
  - `bad_request` for an over-long message (F-01);
  - `/api/engine`.
- [ ] **429 is understood.** A unit test: a fetch that returns a plain `429` makes `streamChat` reject with code `rate_limit`, and the user-facing text is `describeChatError`'s rate-limit message.
- [ ] **`npm run verify:prod -- <url>`** checks a deployed URL and exits non-zero if any check fails:
  - the app's HTML and JS load;
  - **no key name or key value in any served JS file** (the same needles as `audit:facts`, including the real key if `ANTHROPIC_API_KEY` is set locally);
  - `/api/engine` answers;
  - a short chat request completes with `done`;
  - **a full-length reply completes**: a prompt that asks for about 1,000 tokens must reach `done`. If the platform cuts the stream, the check fails and reports the elapsed time, so the PO learns the platform's real limit;
  - optionally with `--rate-limit`: the 7th request within 3 minutes gets `rate_limit`. It's opt-in because it spends real requests.

  It prints JSON results like the other `verify:*` scripts.

- [ ] **No regression:** `npm run -s check`; `verify:llm`, `verify:chat` and `verify:todos`, with screenshots in a temp folder.

## Limits

- **No new dependencies** except `@netlify/functions`, and only if the function needs its types. Say so if you add it.
- **Don't run `deploy:preview` or `deploy:prod`, and don't log in, link or create sites.** Those need the PO's account. Stop at "ready to deploy" and give the PO the exact commands, in order.
- **Don't modify:**
  - `.claude/`, `CLAUDE.md`, the `CONTEXT-*` and `AUDIT-*` files, `docs/audit/`, `TECH-DEBT.md`
  - `vite.config.ts` and the tsconfigs, except to include the function's folder in type-checking and linting if needed. Say so.
- ADR-13 is the only ADR you write.
- Follow CLAUDE.md:
  - limits are invariants
  - the self-correction loop
  - intermittent failures are findings
  - silently dropping user data or part of a request is a product question
  - foreground checks

## Plan

Written by the `feature-builder` subagent on 2026-10-02. One commit per step.

| #   | Step                                                                                                                                                                                                     | Files                                                                                                       | Criterion                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | Write this plan                                                                                                                                                                                          | this file                                                                                                   | —                              |
| 2   | Extract one transport-free core (`runChat`, `engineInfo`) from the Node handler; the `(req, res)` handlers become adapters over it; add a Web `Request` → `Response` adapter that streams NDJSON; ADR-13 | `server/llm/chat-core.ts`, `server/llm/handler.ts`, `server/llm/web-handler.ts`, `ARCHITECTURE.md`          | Same behavior as development   |
| 3   | The Netlify Function: a default export over the Web adapter, `config.path` for both routes, the rate limit rule; a test drives it with `Request`s; include its folder in typecheck and lint              | `netlify/functions/api.ts`, `server/netlify/api-function.test.ts`, `tsconfig.node.json`, `eslint.config.js` | Same behavior as development   |
| 4   | The browser client maps any HTTP 429 to `rate_limit`; unit test with `describeChatError`                                                                                                                 | `src/shared/llm/client.ts`, `src/shared/llm/client.test.ts`                                                 | 429 is understood              |
| 5   | `verify:prod` smoke check, `deploy:preview` and `deploy:prod` scripts, the "Production (Netlify)" note                                                                                                   | `scripts/verify-prod.mjs`, `package.json`, `.env.example`                                                   | verify:prod                    |
| 6   | Run every check and record the evidence (verify:prod against a local `vite preview` on the mock; the Netlify emulation command for the PO)                                                               | `docs/evidence/deploy-netlify-verification.md`                                                              | Local emulation, no regression |

## How you deliver

1. Commits with hashes.
2. Each criterion, met or not met, with its evidence.
3. **The exact commands the PO must run, in order:** log in, create or link the site, set environment variables (name the variables only, never values), and the first preview deploy.
4. Decisions I made that this contract didn't cover.
5. The final `npm run -s check`.

## Amendment 1 (after the first pass, approved by the PO on 2026-10-02)

### PO decisions on the questions you raised

1. **`netlify.toml` is allowed** (decision 8 overruled; CLAUDE.md now has an explicit exception). Move the build settings into it: build command, publish dir, functions dir, and Node 22. The README's deploy steps must then have **no manual build-settings step**.
2. **Split the routes:** `/api/engine` must not spend the chat's rate limit. Use **two Functions**:
   - chat keeps `windowLimit: 6, windowSize: 180` per IP;
   - engine info gets its own rule, `windowLimit: 60, windowSize: 180` per IP.

   That uses both of the free plan's 2 rules. Both stay thin adapters over the shared core (ADR-13). Update ADR-13 to say so.

3. **Rate-limit wording:** the user-facing text for `rate_limit` becomes "Too many requests right now. Wait a couple of minutes and try again." Update the tests that assert it.
4. **D-03 isn't fixed** (re-deferred by the PO; see TECH-DEBT D-03).

### A harness fix for local emulation

`npx` needs approval in headless sessions. Add `npm run serve:prod` = `netlify serve` (or the equivalent that builds and serves the app plus Functions locally), and use it to run `npm run verify:prod -- <local url>` on the mock engine. Report the exact command and its result. If `netlify serve` needs the site to be linked, or anything else from the PO, stop and say exactly what.

### Acceptance criteria

- [ ] `netlify.toml` holds every build setting. The README's deploy section has no UI build-settings step.
- [ ] Two Functions, each with its own `config.rateLimit`. A test checks both rules and their paths against `LLM_CONFIG`.
- [ ] The rate-limit text is as above, with tests updated.
- [ ] `npm run serve:prod` plus `verify:prod` locally on the mock: met, or blocked with the exact reason.
- [ ] No regression: `npm run -s check`, and `verify:llm`, `verify:chat` and `verify:todos`, with screenshots in a git-ignored folder inside the repo.

### Limits

The same as the original. One commit per decision.

### Plan (Amendment 1)

Written by the `feature-builder` subagent on 2026-10-02. One commit per step.

| #   | Step                                                                                                                         | Files                                                                                             | Criterion                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------- |
| A1  | Write this plan                                                                                                              | this file                                                                                         | —                         |
| A2  | `netlify.toml` with build command, publish dir, functions dir and Node 22; a README deploy section with no UI build settings | `netlify.toml`, `README.md`                                                                       | `netlify.toml`            |
| A3  | Split into two Functions (chat 6/180, engine 60/180), both over the Web adapter; test both rules and paths; update ADR-13    | `netlify/functions/chat.ts`, `netlify/functions/engine.ts`, `server/llm/netlify-function.test.ts` | Two Functions             |
| A4  | The new rate-limit wording, and the tests and checks that assert it                                                          | `src/shared/llm/errors.ts`, `src/shared/llm/client.test.ts`                                       | Rate-limit text           |
| A5  | `npm run serve:prod`; run it with `verify:prod` on the mock; run every regression check; record the evidence                 | `package.json`, `docs/evidence/deploy-netlify-verification.md`                                    | serve:prod, no regression |

## Amendment 2 (after the second pass, approved by the PO on 2026-10-02)

### Why

Pass 2 ran `netlify serve --debug` with the real `.env` loaded. `DEBUG=*` made the tooling print the environment, real `ANTHROPIC_API_KEY` included, into a local log, and the server it started outlived the session with the key in its environment, listening on every interface. The key is being rotated. This amendment makes the local production run **structurally unable** to hold a real secret, and makes the local check one command that cleans up after itself.

### Decisions (not up for discussion)

1. `npm run serve:prod` becomes `node scripts/serve-prod.mjs`, a wrapper that starts `netlify serve --offline` with `INFERENCE_ENGINE=mock` and **every secret variable from `.env.example` set to an empty value in the child's environment**, so the CLI's `.env` injection can't override them. It refuses `--debug`, `DEBUG` and any `*_API_KEY` passed in, and exits non-zero without starting.
2. New `npm run verify:prod:local`: in the foreground, it starts the wrapper on a free port, waits until the site answers, runs `verify:prod` against it, **always stops the server** (on success, failure or Ctrl+C), and exits with `verify:prod`'s code. Use `localhost` as the host, not `127.0.0.1`: the CLI binds IPv6.
3. Never run any command with `--debug`, `DEBUG=*` or verbose environment dumps in this project. Never print, read or log `.env` values.
4. `deploy:preview` and `deploy:prod` stay as they are.

### Acceptance criteria

- [ ] **Invariant:** whatever arguments or environment `serve:prod` is started with, the served Functions never receive a non-empty `ANTHROPIC_API_KEY`, and the engine is `mock`. Evidence: a unit test of the wrapper's child-environment builder over several inputs (real-looking key in the parent env, in the args, `DEBUG=*`, `--debug`), plus `verify:prod:local` reporting `"engine": "mock"`.
- [ ] `npm run verify:prod:local` passes every check on the mock, and afterwards **no process listens on its port** (checked by the script itself before it exits). Evidence: its output in `docs/evidence/deploy-netlify-verification.md`.
- [ ] `npm run serve:prod -- --debug` exits non-zero without starting. Evidence: the test.
- [ ] No regression: `npm run -s check`, `verify:llm`, `verify:chat -- <tmp dir>`.

### Limits

- Don't touch `.env`. Don't print environment variables, even masked. Don't run anything in the background: `verify:prod:local` is the only way you start the server.
- No new dependencies.
- One commit per decision.

### Plan (Amendment 2)

Written by the `feature-builder` subagent on 2026-10-02. One commit per step.

| #   | Step                                                                                                                                                                                                                                                    | Files                                                                                                     | Criterion                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| B1  | Write this plan                                                                                                                                                                                                                                         | this file                                                                                                 | —                            |
| B2  | Decision 1: a pure child-environment builder and argument guard (secrets from `.env.example` blanked, `INFERENCE_ENGINE=mock`, `DEBUG` removed; `--debug`, `DEBUG`, `*_API_KEY` refused); `serve:prod` = `node scripts/serve-prod.mjs`; a property test | `scripts/serve-prod-env.mjs`, `scripts/serve-prod.mjs`, `scripts/serve-prod-env.test.mjs`, `package.json` | Invariant, `--debug` refused |
| B3  | Decision 2: `verify:prod:local` starts the wrapper on free ports, waits for `localhost`, runs `verify:prod`, always stops the server tree and proves both ports are closed                                                                              | `scripts/verify-prod-local.mjs`, `package.json`                                                           | `verify:prod:local`          |
| B4  | Decisions 3–4: the README's local-run instructions use `verify:prod:local` and say never to run with `--debug`/`DEBUG`; the old PowerShell override is removed from the evidence                                                                        | `README.md`                                                                                               | —                            |
| B5  | Run `verify:prod:local`, `check`, `verify:llm`, `verify:chat -- <tmp dir>`; record the evidence                                                                                                                                                         | `docs/evidence/deploy-netlify-verification.md`                                                            | Every criterion              |
