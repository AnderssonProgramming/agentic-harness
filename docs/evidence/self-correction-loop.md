# Self-correction loop (Sprint 2, item 2.5)

Criterion: a compile error is introduced on purpose, and the agent detects and fixes it on its own during a normal task.

## Setup (identical for every attempt)

1. A fresh clone of `main`, with `npm ci`.
2. A **real compile error** committed in the clone with a bland message (`refactor(chat): tidy reply status checks`), so there's no uncommitted diff pointing at it. The error is in `src/features/chat/model/message.ts:35`: `'streaming'` became `'streamng'`, which gives `TS2367`. At runtime it would make `isReplying` always false, which re-enables double sends.
3. A **normal task** in a fresh headless session that never mentions an error. It runs with `--permission-mode acceptEdits` and the `check` and `git` commands allowed, the equivalent of the PO approving edits.

## Attempt 1: a placeholder text change (contract at `4a694a4`)

Prompt: "Approved, no plan needed: change the composer's placeholder text…"

**Result: never reached the build.** The agent refused, correctly: "no plan needed" in chat can't waive the plan rule, and no backlog item covers the placeholder. It offered three compliant paths. This was a bad test task, because it isn't a normal approved task in this repo.

## Attempt 2: execute an approved plan for B-10 (contract at `4a694a4`)

The clone also got a two-step plan for B-10 (starter questions), marked approved. **That plan was a test fixture written for this experiment, not an actual PO approval. B-10 is still pending on `main`.**

Prompt: "Execute the approved plan docs/plans/b-10-starter-questions.md for B-10. Commit each step when its checks pass."

| Loop step                    | Result                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Detect                       | ✅ Ran `npm run check` before starting, and showed the full output                                             |
| Read the full error          | ✅ Quoted `message.ts(35,37): error TS2367 …` verbatim                                                         |
| Find the cause without hints | ✅ Traced it to commit `2a4704d` and explained the runtime impact (double send, hidden Stop)                   |
| Fix, rerun, continue         | ❌ **Stopped to ask.** CLAUDE.md required an approved plan for any code change, and the fix wasn't in the plan |

The guide's table lists this as "stops at the wrong point". The contract was blocking the loop.

**Rule added** (`d1d9029`, "Self-correction loop" in CLAUDE.md): when `check` fails during an approved task, fixing **defects** is part of the task, with no new plan. Read the complete output first, fix the cause, add a test if none caught it, rerun up to 3 times, commit the fix on its own, and report it. Changes to scope, configuration or dependencies still stop and ask.

## Attempt 3: same setup, with the new rule (contract at `d1d9029`)

Tool calls from the transcript (38 turns, USD 0.96):

| Call  | What the agent did                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------- |
| 1–13  | Read the plan, backlog, ADRs and the files to change                                                                    |
| 14–21 | Implemented step 1 of B-10                                                                                              |
| 22    | `npm run format && npm run check`, which **failed**: `error TS2367: … 'MessageStatus' and '"streamng"' have no overlap` |
| 23    | Searched the code for the cause by itself                                                                               |
| 24    | **Edit** `message.ts`: `'streamng'` → `'streaming'`                                                                     |
| 25    | **Reran** `npm run check`, which passed                                                                                 |
| 26    | Committed the fix **on its own**: `94197cb fix(chat): restore the 'streaming' status check in isReplying`               |
| 27–37 | Finished B-10 (two more commits), each after a passing `check`                                                          |

The final report listed it under "Fixed along the way", with the original error, the commit that caused it, and its impact. The agent never asked where the error was.

**Independent verification** in the clone afterwards: `npm run check` exits 0, 101 tests pass, and `message.ts:35` reads `'streaming'` again.

Result, from the guide's table: **detects, fixes and verifies on its own: the loop works.**

## Side observations

- Three permission denials, all on exploratory chained commands (`cd … && cat …`, a compound `sed`). The agent switched to the Read and Edit tools on its own. The no-chaining rule is doing its job.
- The agent noted that an existing test (`message.test.ts`, "refuses … a second send while a reply is streaming") already covers `isReplying`, so it didn't add one. That test would have failed too, but `check` stops at the typecheck before running tests.
