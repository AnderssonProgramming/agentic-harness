# Sprint 3 Review: demo script

Three minutes of demo plus two of questions. Rehearse with a timer. Have everything open and loaded before you start.

## Before the call (10 minutes early)

1. Check `.env` has a working `ANTHROPIC_API_KEY`: `npm run engine:check` should print `reply: OK`.
2. **Terminal 1:** `npm run dev`. In Chrome, open http://localhost:5173.
   - Click **New conversation**, so you start clean.
   - Open DevTools → **Application → Local Storage → localhost:5173** and keep the `compass.todos` key visible. This is the "verify the data, not the text" moment.
3. **Tab 2:** `docs/evidence/b-11-delegation-record.md`, open at "The three passes".
4. **Tab 3:** `ARCHITECTURE.md`, open at "ADR-11", scrolled to "PO review".
5. **Backup:** if the live API fails, run `npm run verify:todos -- --live` beforehand and keep its output open.

## Script

| Time      | What you show                                                                                                                                                                                                                                                                                                                                                            | What you say (short)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | The chat, empty                                                                                                                                                                                                                                                                                                                                                          | "My user is a junior dev who's afraid to interrupt seniors. So Compass can now keep their to-do list: park a question, ask it later. The user asks, the app does it, the app confirms."                                                                                                                                                                                                                                                  |
| 0:20–1:20 | **Live cycle.** Type _"Remind me to ask Ana how deploys work."_ → the card goes from pending to **"Added to your list"**. Point at DevTools: `compass.todos` now holds it. Type _"What's on my list?"_ → the card lists it. Type _"Mark the deploy one as done"_ → done, and the stored `done: true` shows. **Reload the page:** the cards and the list are still there. | "The model recognizes the intent with tool calling. The app writes to storage, **reads it back**, and builds the card from what's stored. The model's words can't say 'done'."                                                                                                                                                                                                                                                           |
| 1:20–2:10 | The delegation record, "The three passes"                                                                                                                                                                                                                                                                                                                                | "I wrote a contract and a subagent built it in 16 commits. I didn't write a line of code. Pass 1 had every check green, but on the local model `phi3` said _'I've set a reminder'_ with nothing stored. So I amended the **contract**, not the code. Pass 2 fixed it. My own verification under load then found a flaky check, so a third, narrow pass found the cause."                                                                 |
| 2:10–3:00 | ADR-11, "PO review"                                                                                                                                                                                                                                                                                                                                                      | "The subagent's design note claimed false confirmations were _structurally impossible, whatever the engine says_. I could prove that false, so I accepted the design **with corrections**: the cards are honest, but a prompt is never the control. And I overruled two of its quiet decisions: resetting unreadable data with no notice, and silently dropping a second request. Those are product decisions, so the rule now says so." |

## If something goes wrong

- **Claude is slow or down:** show the backup `verify:todos -- --live` output. It reads storage through DevTools, so it's the same proof.
- **Someone asks about Ollama:** a to-do phrase gets the app's "Not added" message and a notice. The model is never asked. Don't demo it live, because a cold `phi3` start can time out (B-13).

## Likely questions (one-line answers)

- **How do you know the data was really saved?** The card is built from a read-back of storage, and `verify:todos` reads storage from outside the page through DevTools.
- **What did the subagent decide that you wouldn't have?** It reset unreadable data with no notice, and it ignored a second action in a reply. Both were overruled in Amendment 1.
- **What did your contract miss?** Live evidence on every engine it named, and a rule about silently dropping user data. Both are rules now.
- **What about long sessions?** One session survived 2 h 44 min, a 2-hour outage and 4 compactions. Subagents don't get compacted, so passes are now sized to fit the budget.
