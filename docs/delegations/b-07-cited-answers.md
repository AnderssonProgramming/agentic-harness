# Delegation: B-07 cited answers

Status: approved by the PO on 2026-10-03 (as written). Runs **after** B-06 is done.
Delegated to: the `feature-builder` subagent, in one bounded session. This contract **is** the plan.

## Context you need

- `BACKLOG.md`: item **B-07** only.
- `ARCHITECTURE.md`: the _Decision index_, then ADR-04, ADR-09, ADR-12 and ADR-13.
- What B-06 built: the knowledge loader under `server/llm/` (find it from ADR-12's update), `system-prompt.ts`, `chat-core.ts`, `web-handler.ts`, `vite-plugin.ts`, `netlify/functions/engine.ts`.
- Chat UI: `src/features/chat/components/reply-body.tsx`, `message-list.tsx`, `chat-screen.tsx`; `src/features/chat/hooks/use-chat.ts`; `src/shared/llm/protocol.ts`, `client.ts`.
- Pattern for the browser check: `scripts/verify-chat.mjs`.

## Decisions already made

1. **The model cites, the app verifies.** The system prompt asks the model to end every answer that uses the knowledge base with one line, `Sources: file-a.md, file-b.md`. When no document applies, it must say so in the answer (e.g. "Our team documents don't cover this") and write no Sources line. A prompt is never the control (CLAUDE.md), so:
   - the **browser** parses that last line and checks each name against the list of loaded documents;
   - a known name becomes a clickable source chip;
   - an unknown name is shown as plain text marked **"not a known document"**, never clickable, never silently dropped.
2. **The list of loaded documents** reaches the browser through a `GET /api/knowledge` route returning `[{ source, title }]`. **`GET /api/knowledge/<source>`** returns one document's text. Both are served by the existing **engine** Function (`netlify/functions/engine.ts`, add the paths to its config), under its existing 60-per-180-s rate limit. Netlify's free plan has no third rule. Only documents that passed B-06's guards are served. A name that isn't loaded gets 404; never read paths from the request onto the filesystem.
3. **The side panel:**
   - a presentational component (ADR-04), opened by clicking a chip;
   - shows the document's text as **plain text** (no HTML rendering), with a close button and Escape to close;
   - focus moves into the panel and back to the chip on close;
   - no motion under `prefers-reduced-motion`;
   - on narrow screens it covers the chat.
4. Citations are derived from the stored message text on render, so **no stored-shape change**.

## Acceptance criteria

- [ ] An answer based on `knowledge/` ends with its source name(s) as chips. Evidence: a parser unit test, plus a **live** Anthropic run asking "What is our branch naming convention?", recorded in `docs/evidence/b-07-verification.md` (one or two requests).
- [ ] Clicking a source shows the file content in a side panel. Evidence: component test, plus a `verify:chat` step on the mock engine. The mock may emit a fixed `Sources:` line for a test phrase.
- [ ] When no document applies, the assistant says so and shows no source. An invented source name is shown as "not a known document" and isn't clickable. Evidence: parser tests for both, plus the live run with a question the documents don't cover.
- [ ] `/api/knowledge/<name>` refuses anything not in the loaded list (404), including `../` and absolute paths. Evidence: test.
- [ ] No regression: `npm run -s check`, `npm run verify:chat -- <tmp dir>`, `npm run verify:llm`, `npm run verify:prod:local`.

## Limits

- No new dependencies. Don't modify `.claude/`, `CLAUDE.md`, the context files, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `knowledge/*.md`. `netlify.toml` only if the new paths need it.
- Never run anything with `--debug` or `DEBUG`, never print environment variables or the system prompt in logs, never start a server in the background. Don't read `.env`.
- Size: if this grows past about 6 steps, finish the current step, commit, and hand off.
- One commit per step. Record the design as **ADR-14** (status "Proposed by the agent, pending PO review") with a Decision-index row; set B-07 to `done` with the evidence file.

## How you deliver

Commits with hashes; each criterion with its evidence; **"Decisions I made that this contract didn't cover"**; the final `check` result.
