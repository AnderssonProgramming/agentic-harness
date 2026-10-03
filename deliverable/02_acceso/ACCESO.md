# ACCESO: Compass

**Where:** https://agentichs.netlify.app (runs in the browser, desktop or phone; nothing to install).
**How I get in:** no account, no credentials. Open the link and type.
**What to try:** the 5 steps below, in order (about 2 minutes).
**What doesn't work yet:** it doesn't know _your_ team's documents (B-06, not built). Data lives only in the browser you used. Chat is limited to 6 messages every 3 minutes per visitor. Details below.

---

## What to try

Compass is an onboarding assistant for a junior developer in their first weeks at a small team: someone who has questions but is afraid of interrupting seniors with "basic" ones.

1. **Ask a question.** Type _"What's a good way to organize a React app by feature?"_ and press Enter. The reply streams in word by word.
2. **Ask a follow-up that needs memory.** Type _"Give me a short example of the folder tree for that."_ It answers from the earlier turn, without you repeating it.
3. **Give it a task.** Type _"Remind me to ask Ana how deploys work."_ A to-do appears in the list. The confirmation in the chat is built from what was actually **saved**, not from what the model said.
4. **Ask about the list, then complete an item.** Type _"What's on my list?"_, then _"Mark the deploy one as done."_ The answer comes from storage, and the item is checked off.
5. **Close the tab and open the link again.** The conversation and the to-do list are still there.

## What doesn't work yet (known limits)

| Limit                                                                                                                                               | Why it's that way                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| It doesn't know your team's real documents or code; answers are general knowledge                                                                   | Backlog item B-06 (knowledge base) was scoped out of this course. The architecture decision for it (ADR-12) is written |
| Conversation and to-dos are stored only in **that browser** (no accounts, no sync between devices)                                                  | A deliberate scope decision (ADR-10): no backend database, no personal data on a server                                |
| **6 chat messages every 3 minutes** per visitor. Past that, the app says "Too many requests right now. Wait a couple of minutes and try again."     | Rate limits protect the paid model budget (ADR-13). A monthly spend cap is also set with the provider                  |
| If the model provider fails, some error messages show the provider's own wording, and a missing-key error gives developer advice ("Set it in .env") | Recorded debt D-03 (`TECH-DEBT.md`), deferred by the PO with a trigger                                                 |
| Saved history is never pruned, so a very long conversation will eventually fill browser storage                                                     | Recorded debt D-01 (audit finding PER-01, Medium)                                                                      |
| The local engine (Ollama) refuses to-do requests honestly instead of performing them                                                                | Small local models don't support tool calling. Production uses Claude, where it works                                  |

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
