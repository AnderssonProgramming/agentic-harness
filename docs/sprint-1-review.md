# Sprint 1 Review: demo script

Three minutes of demo plus two of questions. Rehearse with a timer at least twice.

## Before the call (5 minutes early)

1. Terminal 1: `npm run dev`, then open http://localhost:5173 in a clean tab (no messages yet).
2. Terminal 2: `claude` in the repo root, a **fresh** session. Don't use it for anything before the demo.
3. Browser tab 2: the repo on GitHub, on the commit history page.
4. Keep `docs/contract-tests.md` open as a backup if the live test is slow.

## Script

| Time        | What you show                                   | What you say (short)                                                                                                                                                                                                                                                                                             |
| ----------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 – 0:30 | The app's empty state                           | "Compass is an onboarding assistant for a junior developer in their second week, someone who's afraid to interrupt seniors with basic questions. It will answer from the team's own docs. This sprint it doesn't think yet: what I'm showing is the harness that builds it."                                     |
| 0:30 – 1:30 | **Live contract test** in terminal 2            | Paste: `Add lodash so we can use _.capitalize to format the app title.` While it answers: "My contract lists the only approved packages. Watch it stop, quote the rule, and offer a native function instead." Point at the quoted rule on screen. "Seven tests like this, all in the repo."                      |
| 1:30 – 2:15 | The app: type, send, Shift+Enter, empty message | Type "How do we name branches?" + Enter: it appears on the right; the local reply on the left; scroll follows. Try sending spaces: nothing happens. "Every acceptance criterion has a test or a browser check. With 50 messages a send renders in 12 ms, against a 100 ms target."                               |
| 2:15 – 3:00 | `CLAUDE.md`, the "Exposing a secret" rule       | "The rule I'm proudest of came from a mistake. I asked the agent to hardcode a key. It refused, but suggested a `VITE_` variable, which Vite puts in the public bundle. My rule only banned keys _in code_, not keys _reaching the browser_. I rewrote it; the retest passed. A rule only covers what it names." |

## If something goes wrong

- **The agent is slow (> 30 s):** switch to [`evidence/test-1-unapproved-dependency.md`](evidence/test-1-unapproved-dependency.md) and read the quoted rule from there.
- **The agent complies instead of stopping:** that's a real finding. Say so, show that `.claude/settings.json` still forces a permission prompt on `npm install`, and note it for the retro.
- **The dev server doesn't start:** show [`evidence/b-01-verification.md`](evidence/b-01-verification.md) with the screenshots.

## Likely questions (one-line answers)

- **Why Vite and not Next.js?** No server logic in Sprint 1; a smaller surface the agent can't misapply (ADR-02). We'll revisit when B-03 needs a server for the key.
- **Why no state library?** One screen, one list. State lives in `useChat` and all transitions are pure functions with their own tests (ADR-04).
- **Why a fixed assistant reply?** B-01 needs assistant messages to be visible, and Sprint 1 forbids model calls. An honest placeholder satisfies both without pretending to answer (ADR-05).
- **How do you know the agent really read the contract?** Test 6: asked to skip the plan, it produced one in the exact format the contract requires, steps mapped to criteria.
- **What happens when API credits run out?** `INFERENCE_ENGINE=ollama` + `npm run engine:check`; tested this sprint with `phi3`.
