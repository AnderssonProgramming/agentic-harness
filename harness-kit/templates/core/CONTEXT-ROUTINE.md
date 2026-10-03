# Context control routine

How to run a working session with the coding agent (Claude Code) without it losing the thread. Each step comes from something measured in `CONTEXT-LOG.md`. The agent follows the agent-side steps because `CLAUDE.md` points here. The PO follows the rest.

## The budget

- A fresh session starts at **about 30k tokens** (system prompt, tools, `CLAUDE.md`). That's the floor.
- **Healthy:** under 80k. Typical one-item sessions measured this program end at 50–70k.
- **Act** at about 80k tokens, at 40 turns, or at the first signal below, whichever comes first. Check with `/context` in Claude Code, or afterwards with `npm run context:profile -- run.jsonl` on a headless transcript.
- What fills it, from most to least wasteful: whole files read "to understand", command output from passing commands, old failed attempts, chained `cat`s.

## Before starting a task

1. **One session, one task.** A different backlog item, or a different kind of work (building vs. testing a skill vs. writing docs), means a new session: `/clear`, or a new `claude`. `CLAUDE.md` and the files reload on their own; the previous task's noise doesn't.
2. **Plan first.** The agent writes the plan to `docs/plans/<item>-<slug>.md` (CLAUDE.md, "How we work" step 2). In Claude Code, Plan Mode (Shift+Tab until it says _plan mode_) keeps it from editing until you approve. Check the plan against the item's acceptance criteria before approving. A plan that doesn't map every criterion is incomplete.
3. **Read narrowly.** In the request, name the backlog item and the files.
   - **ARCHITECTURE.md:** read the _Decision index_, then only the ADRs the task touches: `Grep "ADR-04" -A 12 ARCHITECTURE.md`. Never the whole file. That was 3,200 tokens per session.
   - **BACKLOG.md:** only the item: `Grep "\[B-08\]" -A 14 BACKLOG.md`.
   - **Code:** the files the plan lists. For a file over about 200 lines, `Grep` the symbol first, then `Read` with an offset.
   - **Never** chain several `cat`s in one command. One such call was 69 % of a session's context.

## During the task

4. **Keep noisy work out of the conversation:**
   - **Long or chatty commands** (installs, builds, the browser verifiers, dev servers) run in the background (`run_in_background`), and the agent reads only the result or the tail. **Exception: in a headless session (`claude -p`), run them in the foreground with quiet flags.** A background task dies when the reply ends (long-session test, turn 1).
   - **Experiments and reliability runs** go in a separate headless session in a scratch clone: `claude -p … --output-format stream-json > run.jsonl`. Only the summary comes back.
   - **Broad searches** across many files go to a subagent (the _Explore_ agent), which returns conclusions, not file dumps.
5. **Passing output is noise; failing output is signal.** Run checks quietly (`npm run -s check`). When one fails, read the full output of the **failing command** once (e.g. `npm run typecheck`), then fix it (CLAUDE.md, "Self-correction loop"). Don't paste whole passing logs or full JSON reports into the conversation.
6. **Close every step before the next one.** The agent runs `format` and `check`, commits, and reports what changed and how to verify it. The PO confirms the result before saying "next". A step that isn't committed isn't done.
7. **Numbers and results come from the source, not memory.** Counts, test totals, timings and commit hashes are read from `git log`, the test output or the evidence file when written down. A result is written down only after it exists.

## Signals to compact or restart

Act on the **first** one. Don't wait for a second.

| Signal                                                         | Example (reference project)                                     | Action                                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| It repeats an error that was already corrected                 | The same shell-quoting failure, four times in one session       | **Restart.** The correction is buried; write it into `CLAUDE.md` or the skill first             |
| It proposes something an ADR rejected                          | A `VITE_` key, a router library, a UI to pick the engine        | **Restart**. If it happens again in a new session, the decision is missing from the ADR         |
| It contradicts a rule in `CLAUDE.md`                           | Two components in one file                                      | `/compact` with "keep: the rules in CLAUDE.md and the current plan step", then re-read the rule |
| It remembers files, counts or results wrongly                  | "32 runs" when there were 30                                    | Re-verify from the source; `/compact` if it happens twice                                       |
| It writes a result before it exists                            | A demo script claiming a test passed while it was still running | Stop, wait for the result, and treat it as a "remembers wrongly" signal                         |
| The same scope decision differs between sessions               | "for B-06" accepted in one session, refused in another          | The rule needs judgment; make it mechanical in `CLAUDE.md` or the skill                         |
| Context over about 80k tokens or past 40 turns, with work left | —                                                               | `/compact` with what to keep, or finish the step, commit, and start a new session for the rest  |

When compacting, say what to keep, e.g. `/compact keep: plan docs/plans/b-08-…, steps 1–2 done (commits abc123, def456), next is step 3; the rules in CLAUDE.md`.

## When closing the task

8. **What was learned goes into the harness, not the chat:**
   - a rule that had to be repeated goes into `CLAUDE.md`
   - a design decision goes into an ADR, with a row in the index
   - a skill failure goes into the skill's _Known errors_
9. **Commit with a readable message before changing task**, then start a new session (step 1).

## Delegating a feature to another session

Used when the PO's session must not do the coding:

1. The PO writes or updates the backlog item with verifiable criteria.
2. A new session gets **one** request: the item ID, "propose the plan in `docs/plans/`, then stop".
3. The PO reviews the plan against the criteria and answers "approved" (or corrections) **in the same session**, so the plan stays in its context. For a headless session, use `claude -p … --resume <session-id>`.
4. Execute **one step per request** ("execute step 1, then stop and report"), and verify independently between steps: `git log`, `npm run -s check`, and the step's own check.
5. **Check the context after every turn** (`npm run context:profile -- turn.jsonl`, last value). Over 80k, send `/compact keep: <plan file>, <decisions>, steps done with their commits, next step, rules files>` before the next step. Don't let it slide: in the long-session test it reached 125k before anyone looked.
6. If a turn is cut off mid-step (usage limit, crash), resume by compacting with "step N was interrupted; partial changes in <files>", then "continue step N". Don't start over.
7. At the end, profile the transcripts and add anything new to `CONTEXT-LOG.md`.

## Delegating to a subagent (blind delegation)

Here the PO doesn't steer turn by turn: the subagent (`claude -p --agent feature-builder`) runs a whole contract in one reply.

1. **Contract first.** Write it in `docs/delegations/<item>-<slug>.md`, in three parts:
   - the minimal context, as a file list
   - the decisions that aren't up for debate
   - the criteria as observable behavior, plus limits

   Don't leave any of the three out.

2. **Size each pass to the budget.** Nobody compacts a subagent mid-reply. In the reference project, B-11's first two passes peaked at 199k and 232k tokens, while a narrow third pass stayed at 81k and cost a quarter as much. If a contract has more than about 5 steps, or touches more than one layer (server, shared, feature, verification), split it into a first pass and amendments.
3. **Each pass gets a fresh session.** The contract and git history carry the state. Don't resume a 200k session.
4. **Verify independently, never from the report:**
   - `check` several times in a row, to catch flakiness
   - every `verify:*` once **under load** (run the test suite concurrently), because races hide on an idle machine
   - every engine a criterion names, **live**
5. **Answer with the contract, not the code.** An unmet criterion or a decision you overrule becomes an amendment with behavioral criteria and an evidence list, followed by a new pass. Fixing the code by hand means the delegation failed. Record it as the finding.
6. **Read the decisions list first.** It's where the agent crossed into product territory, e.g. silent data loss or dropped requests.
