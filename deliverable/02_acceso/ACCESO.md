# ACCESO: Compass

**Where:** https://agentichs.netlify.app (runs in the browser, desktop or phone; nothing to install).
**How I get in:** no account, no credentials. Open the link and type.
**What to try:** the 5 steps below, in order (about 2 minutes).
**What doesn't work yet:** it knows a **sample** team's documents (four files), not yours. Data lives only in the browser you used. Chat is limited to 6 messages every 3 minutes per visitor. Details below.

---

## What to try

Compass is an onboarding assistant for a junior developer in their first weeks at a small team: someone who has questions but is afraid of interrupting seniors with "basic" ones.

1. **Ask about the team.** Click the suggested question **"What is our branch naming convention?"**. The reply streams in, answers from the team's documents (`<type>/<item-id>-<short-slug>`), and ends with a **source chip**, `branch-naming.md`.
2. **Open the source.** Click the chip. A side panel shows the original document. Press Escape to close it.
3. **Ask something the documents don't cover.** Type _"How do we handle state management?"_. Compass says the team documents don't cover it, and shows **no source**: it doesn't invent one. If the model ever names a file that doesn't exist, the app marks it "not a known document" and doesn't make it clickable.
4. **Give it tasks.** Type _"Remind me to ask Ana how deploys work."_ A to-do appears, with a confirmation built from what was actually **saved**. Then type _"What's on my list?"_ and _"Mark the deploy one as done."_
5. **Close the tab and open the link again.** The conversation, the sources and the to-do list are still there.

That's 5 messages. The limit is 6 per 3 minutes, so wait 3 minutes before trying the walkthrough a second time.

## What doesn't work yet (known limits)

| Limit                                                                                                                                               | Why it's that way                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| It answers from a **sample** team's four documents (`knowledge/`), not your team's. Anything else is general knowledge                              | To use it for a real team, replace the files in `knowledge/` and redeploy. Files with key-like content or over 50 KB are skipped (ADR-12) |
| Conversation and to-dos are stored only in **that browser** (no accounts, no sync between devices)                                                  | A deliberate scope decision (ADR-10): no backend database, no personal data on a server                                                   |
| **6 chat messages every 3 minutes** per visitor. Past that, the app says "Too many requests right now. Wait a couple of minutes and try again."     | Rate limits protect the paid model budget (ADR-13). A monthly spend cap is also set with the provider                                     |
| If the model provider fails, some error messages show the provider's own wording, and a missing-key error gives developer advice ("Set it in .env") | Recorded debt D-03 (`TECH-DEBT.md`), deferred by the PO with a trigger                                                                    |
| Saved history is never pruned, so a very long conversation will eventually fill browser storage                                                     | Recorded debt D-01 (audit finding PER-01, Medium)                                                                                         |
| On the local engine (Ollama), adding and completing to-dos is refused honestly; "What's on my list?" still works, read from storage                 | Small local models don't support tool calling (B-12). Production uses Claude, where everything works                                      |

## Run it locally instead (optional)

You need Node 22+ and the repository: https://github.com/AnderssonProgramming/agentic-harness

```sh
git clone https://github.com/AnderssonProgramming/agentic-harness.git
cd agentic-harness
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:5173. In `.env`, set `ANTHROPIC_API_KEY=<your key>` to use Claude, or `INFERENCE_ENGINE=mock` to try the interface with no key (it echoes your message, but still performs simple to-do phrases). Restart `npm run dev` after changing `.env`.

**Checked on 2026-10-03** against production:

- `npm run verify:prod -- https://agentichs.netlify.app` passed 6/6 checks (the page, the scripts, no secrets in the served files, the engine, a short and a long streamed reply);
- a live request with "Remind me to read the team ADRs" returned a real `add` action.
