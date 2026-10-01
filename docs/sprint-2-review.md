# Sprint 2 Review: demo script

Three minutes of demo plus two of questions. Rehearse with a timer. Have everything open before you start, so nothing gets installed or configured live.

## Before the call (10 minutes early)

1. `.env` has a working `ANTHROPIC_API_KEY`. Run `npm run engine:check` and expect `reply: OK`.
2. **Terminal 1:** `npm run dev`. Open http://localhost:5173 in a clean tab.
3. **Terminal 2:** a scratch clone ready for the live skill run, so `main` isn't touched:
   ```bash
   git clone https://github.com/AnderssonProgramming/agentic-harness.git demo && cd demo
   git checkout 824ea24 && npm ci && claude
   ```
   Open it once interactively so the folder is trusted, and leave the session idle.
4. Browser tab 2: `TASKS.md` on GitHub, scrolled to "Before and after".
5. Backups in case something fails live:
   - `docs/evidence/skill-new-route-reliability.md`
   - `docs/evidence/b-03-verification.md`
   - `docs/evidence/self-correction-loop.md`

## Script

| Time      | What you show                                                   | What you say (short)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | `TASKS.md`, the T-01 score                                      | "I measured before automating. Adding a screen took 36 minutes and 9 reviewed steps, so it scored highest of the tasks the track asked for. The contract test scored higher, but it's not the track skill, so it's my Skill 3 candidate."                                                                                                                                                                                                                        |
| 0:20–1:10 | **Live:** in terminal 2, type `/new-route knowledge (for B-06)` | "One command." While it runs (about 2 minutes, keep talking): "It refuses if no backlog item is named. It writes 8 files, registers the route, and runs typecheck, lint and tests. Then it opens the route in a real headless Chrome." Show the final report: 6/6 browser checks.                                                                                                                                                                                |
| 1:10–1:35 | `TASKS.md` before/after                                         | "2.5 minutes and one request, instead of about 6 minutes plus 9 review turns. About 20 minutes saved per screen, roughly one screen a week. It passed three runs in a row in fresh sessions, and it only passed on the fourth series."                                                                                                                                                                                                                           |
| 1:35–2:30 | **Live:** the chat, three turns with Claude                     | Type: "Hi, I'm Lucía, second week as a frontend dev." Then: "We use React with TypeScript. What should I learn first?" Point at the text arriving progressively and the Stop button. Then: "What's my name and our stack?" It answers from turn 1 and 2. If there's time, DevTools → Network → Offline, send something, show the error and Retry.                                                                                                                |
| 2:30–3:00 | `CLAUDE.md`, "Self-correction loop"                             | "What failed: I broke the build on purpose, mid-task. The agent found the exact line on its own, but stopped to ask, because my contract said no code without a plan. So I wrote the loop into the contract: defects are pre-approved, scope changes are not. On the retest it found the error, fixed it in a separate commit, re-ran the check and carried on, without asking me anything." Point at the call table in `docs/evidence/self-correction-loop.md`. |

## If something goes wrong

- **The skill run is slow:** keep talking through the reliability table, and show the run's screenshot in the evidence file when it finishes.
- **The Claude API fails live:** that's the error handling demo. Show the message, then set `INFERENCE_ENGINE=mock` (or `ollama`) and restart. Switching engines needs no code change (B-04).
- **The network is down at the venue:** use `INFERENCE_ENGINE=mock`. The UI, streaming, Stop and errors all work offline.

## Likely questions (one-line answers)

- **Why does the key never reach the browser?** The endpoint runs inside Vite's server (ADR-08), the key has no `VITE_` prefix, and `verify:llm` scans the production bundle for it.
- **What happens when the history gets long?** The whole conversation is sent until it passes a 24,000-character budget. Then the oldest turns are dropped, and it always starts with a user turn.
- **Why a mock engine?** It makes the browser tests deterministic, free and offline. It counts the turns it receives, which proves the history arrives, and `[mock:<code>]` simulates any error.
- **Why did the skills need several series to pass?** Each failure became a written rule or a known error, never a manual fix. Four of them were test prompts that contradicted the repo's own ADRs, and the agent was right to refuse them.
