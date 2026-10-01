# Long-session test (Sprint 3, week 5)

The guide's test: sustain a real work session of at least 60 minutes, following the routine, without the agent losing the thread.

**The session:** one continuous Claude Code session that delegated B-08 (conversation persistence), driven headless with `claude -p --resume <id>` so every turn was measured. The PO side followed `CONTEXT-ROUTINE.md`:

- one task (B-08)
- the plan first, reviewed against the criteria
- one step per request
- an independent `npm run -s check` and `git status` between steps
- compaction with an explicit keep list

## Result

| Measure                                                                  | Value                                                                                                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Duration, first to last turn                                             | **2 h 44 min** (12:11 → 14:55, 2026-10-01), as **one session**                                                                         |
| Of which, an interruption                                                | 2 h 05 min: the account's usage limit hit mid-step 2, and the session resumed after the reset                                          |
| Active work (agent turns, plus the PO's independent checks between them) | **≈ 39 min**: 30 min of agent time and ≈ 9 min of checks                                                                               |
| Turns                                                                    | 15: 11 working turns and 4 compactions                                                                                                 |
| Commits produced                                                         | 12, all checked independently (`check` passed after every step; the tree was clean)                                                    |
| Cost                                                                     | USD 7.69 for the whole session                                                                                                         |
| Degradation signals (the routine's list)                                 | **None observed**: no repeated corrected error, no rejected alternative proposed, no rule contradicted, no misremembered file or count |

**Verdict against the guide:** the session was sustained for more than 60 minutes end to end, across an outage and four compactions, without losing the thread. But **active work time was about 39 minutes, below the guide's 60.** The gap is real and is recorded here. It wasn't filled with artificial extra work, because the routine says "one session, one task", and B-08 was finished.

## Context through the session (tokens at the start → end of each turn)

| Turn | What                | Context              | Notes                                                                                                    |
| ---- | ------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| 1    | Plan                | 31,374 → 64,938      | It read the ADR index, not the whole of ARCHITECTURE.md (4.6k of 12.4k characters).                      |
| 2    | Approve, step 1     | 65,698 → 73,106      |                                                                                                          |
| 3    | Step 2              | 74,139 → (cut off)   | Usage limit                                                                                              |
| —    | **Compact**         | 80,608 → **10,707**  | At the routine's 80k point. Keep list: plan, decisions, step state, partial files                        |
| 4    | Step 2, resumed     | 46,149 → 54,256      | Resumed correctly with no reminders: it cited "decision 2" by number                                     |
| 5–6  | Steps 3–4           | 55,262 → 76,192      |                                                                                                          |
| 7–8  | Steps 5–6           | 77,351 → **125,603** | **Past the 80k budget with no action**: the PO's runner didn't check it. Quality held, but that was luck |
| —    | **Compact**         | 126,690 → **10,394** | Done late; the runner then got an automatic budget check                                                 |
| 9    | Step 7              | 46,762 → 92,758      | The largest step (a browser verifier with real Chrome restarts)                                          |
| —    | Compact (automatic) | 94,922 → 12,626      |                                                                                                          |
| 10   | Step 8              | 49,591 → 83,767      |                                                                                                          |
| —    | Compact (automatic) | 86,614 → 13,246      |                                                                                                          |
| 11   | PO decisions        | 47,698 → 58,375      | Two separate commits as asked                                                                            |

After compaction, every resumed turn starts at **about 46–50k**, not 10k: the summary, plus `CLAUDE.md`, the tools and the turn's first reads. Compaction keeps a long session within budget, but it doesn't make it free.

## What the session got right without being told

- **The self-correction loop worked twice:**
  - a type error in step 5, fixed in the same turn
  - in step 7, persistence broke `verify:chat`'s five-turn check (a reload no longer gives an empty chat). It was fixed in its own commit (`46d6fea`) before step 7 was committed.
- **Numbers came from the source:** "All numbers come from runs today, not from memory" (step 8 report). That's routine step 7.
- **It reported a mismatch between documentation and behavior:** its own browser test lost 20 of 60 streamed characters on a _clean_ close, contradicting ADR-10. It brought this to the PO with two options instead of hiding it.
- **It anticipated a stale contract line** (CLAUDE.md "Current state") and kept that edit for a separate, approved commit.

## What the test changed in the harness

| Finding                                                                                                                                                             | Change                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| In turn 1 the agent ran `check` in the background, as the routine says. In a headless session the background task died with the reply, so the plan wasn't committed | Routine step 4: **headless sessions run checks in the foreground**                                                                  |
| The budget was exceeded for two turns because nobody measured it between turns                                                                                      | Routine, "Delegating" section: **check the context after every turn and compact at 80k**. The PO's runner now does it automatically |
| A usage limit can cut a session mid-step                                                                                                                            | Routine: a step interrupted mid-way is resumed by compacting with "step N interrupted; partial files: …", not by starting over      |

## Independent verification at the end (by the PO, not the agent)

- `npm run -s check`: exit 0, 138 tests.
- `npm run verify:persistence`: 8/8, with real Chrome restarts on the same profile.
- `npm run verify:chat`: 19/19, so persistence didn't break the chat.
