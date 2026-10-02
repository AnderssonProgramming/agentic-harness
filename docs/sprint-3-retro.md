# Sprint 3 harness retrospective

Guiding question: **at what moment did the agent take a decision you wouldn't have?**

## 1. The decision the agent took that I wouldn't have

Three, all in B-11 pass 1. All three were listed honestly in its "Decisions I made" report, and that's the only reason they were caught:

1. **"Unreadable to-do data is removed and treated as an empty list, with no notice."** That's silent data loss. The same situation in the conversation (B-08) already had the opposite rule: say so once.
2. **"Only the first action in a reply counts; later ones are ignored."** "Remind me to A and B" would silently drop B.
3. **Using a system-prompt instruction as the control** against the model claiming an action. On `phi3` it failed immediately: _"Okay, I've set a reminder"_, with nothing stored. The subagent's ADR-11 even called false confirmations "structurally impossible".

The common thread: **each one looked technical but was a product decision about what the user loses or is told.** The agent chose the quiet option every time.

The opposite also happened, and it's worth naming. In week 5, the delegated B-08 agent brought me a mismatch between its ADR and its own browser test (20 of 60 streamed characters lost on a clean close), with options, instead of hiding it. The boundary works when the agent knows which kind of question it's facing.

## 2. What my original delegation contract was missing

- **Live evidence on every engine a criterion names.** The contract required "Ollama: never a false confirmation" but only asked for live runs on Anthropic. Every automated check passed. The failure only showed up when I ran `phi3` myself.
- **"Silently dropping user data or part of a request is a product question."** The limits said "don't decide product questions", but didn't say these are product questions.
- **What to do with an intermittent failure.** Pass 2 saw one, wrote "it passed on every rerun", and moved on. My independent run then caught a check that failed 1 time in 4 under load.
- **Pass sizing.** One contract for a feature spanning protocol, server, browser and verification made passes 1 and 2 peak at 199k and 232k tokens, and nobody can compact a subagent mid-reply. The narrow Amendment 2 ran at 81k for a quarter of the cost.
- **My own precision.** Amendment 1's "to-do phrases are not performed" also caught "what's on my list?", which the app could answer from storage. That's my wording, now B-12.

## 3. The new rules (already committed)

| Rule                                                                                                                                                                           | Where                                                                | From                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------- |
| Silently dropping user data or part of a request is **always a product question**: stop and ask                                                                                | CLAUDE.md, "Delegation contracts"                                    | Pass 1 decisions 1 and 2         |
| **A prompt instruction is never the control** for something a criterion forbids; the app must make it impossible or visibly contradicted                                       | CLAUDE.md, "Delegation contracts"                                    | Pass 1, `phi3`                   |
| **Intermittent failures are findings:** make them fail deterministically, fix, show repeated passes. An absence check first waits for a state that proves presence is possible | CLAUDE.md, "Self-correction loop"                                    | Amendment 2                      |
| Each engine a criterion names gets a **live** run                                                                                                                              | `feature-builder.md`; CONTEXT-ROUTINE.md, "Delegating to a subagent" | Pass 1                           |
| **Size passes to the budget**; hand off at a commit boundary; a fresh session per pass                                                                                         | `feature-builder.md`; CONTEXT-ROUTINE.md                             | Passes 1 and 2 context           |
| The PO verifies **under load**, repeatedly and live, never from the report                                                                                                     | CONTEXT-ROUTINE.md                                                   | The flaky check                  |
| Verification runs don't overwrite committed evidence                                                                                                                           | CLAUDE.md                                                            | Pass 1's screenshots side effect |

**The delegation boundary, as one sentence for Sprint 4:** _the agent decides how; whenever a choice changes what the user loses, sees or is told, it stops and asks._

## Carried into Sprint 4

- **B-12:** "what's on my list?" answered from storage on every engine.
- **B-13:** a cold local model's first reply doesn't time out.
- The subagent's suggestion: give the app an observable "engine info known" state, so the two "notice is not shown" checks can't pass early.
- **ADR-12** (B-06 with a total budget and a secrets guard) is decided but not built, and is the next delegation candidate.
- **Week-5 open item:** the long-session test reached 2 h 44 min end to end, but only about 39 minutes of active work, so a fully qualifying 60-minute session is still owed.
- The orchestrating session repeated a corrected shell mistake a fifth time. A thinner PO session that delegates more, including verification scripts, is the fix to try.
