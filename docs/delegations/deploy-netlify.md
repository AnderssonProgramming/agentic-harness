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

## How you deliver

1. Commits with hashes.
2. Each criterion, met or not met, with its evidence.
3. **The exact commands the PO must run, in order:** log in, create or link the site, set environment variables (name the variables only, never values), and the first preview deploy.
4. Decisions I made that this contract didn't cover.
5. The final `npm run -s check`.
