# Session degradation log

Sources:

- Sessions 1–2 are headless agent transcripts (`claude -p --output-format stream-json`), profiled with `scripts/context-profile.mjs`. It reports context tokens per model call and which tool results filled them.
- Session 3 is the long orchestrating session that ran Sprint 2 week 4. That session can't be profiled, so the evidence is the mistakes it made and the commits that corrected them.

Baseline: every fresh session starts at **about 30,000 tokens** before any work (system prompt, tools, CLAUDE.md). Everything else on this page is on top of that.

## Session 1: delegated B-10 implementation (self-correction attempt 3, 2026-10-01)

- **Task:** execute a two-step plan for B-10 in a clean clone with a deliberate compile error (`docs/evidence/self-correction-loop.md`).
- **Size:** 38 turns, 20 model calls, 350 s, USD 0.96. Context grew from 30,669 to 70,312 tokens (×2.3), with no compaction.
- **What it loaded:** 58,238 characters of tool results, of which **Read was 45,509 (78 %)**.
  - The largest was `ARCHITECTURE.md`, read in full: 12,881 characters, about 3,200 tokens. The task needed none of its ADRs except ADR-04.
  - Then `BACKLOG.md` in full (5,661), and `chat.css`, two test files and three source files "to understand the feature".
- **When it started failing:** it didn't degrade. The work was correct. But calls 1–13 were only reading, before the first edit, and 4 tool calls were denied. Two of the denials were exploratory chained commands (`cd … && ls … && cat …`) that the deny rules block.
- **Symptom:** cost, not errors. Two-thirds of the context was spent before the first line of code.
- **What I did:** nothing at the time. The fix is in the routine: read the ADR index, not the whole file (step 3).

## Session 2: new-route reliability run 3 (series 3, 2026-09-30)

- **Task:** the natural-language invocation "Add a screen for B-06…".
- **Size:** 13 turns, 151 s. Context grew from 30,125 to 49,860 tokens (×1.7).
- **What it loaded:** **one chained command produced 26,555 of the 38,563 characters (69 %)**: `cd <clone> && cat BACKLOG.md ARCHITECTURE.md … && ls …`. It dumped three whole documents into the context at once, before the skill was even invoked.
- **When it started failing:** in the same series, the agent's decisions began to depend on what it happened to read. Runs 1 and 2 stopped because "no backlog item describes this screen". A run in the main repo refused "for B-06". The clone runs accepted it. The same skill gave different scope decisions depending on how much of `BACKLOG.md` each session had loaded and how it weighed it.
- **Symptom:** inconsistent judgment between sessions on the same input.
- **What I did:** made the scope check mechanical (an item ID that exists and isn't done is enough, `824ea24`). That way the decision no longer depends on what a session happened to read. "Plain commands only" moved into the general contract (`868963d`).

## Session 3: the orchestrating session for Sprint 2 week 4 (2026-09-30 → 10-01)

- **Task:** design and build llm-connect, wire the chat, run two reliability series and the self-correction test, and write the close-out docs. It was one continuous session of many hours, holding Sprints 1 and 2 in its history.
- **What it loaded:**
  - Full command outputs pulled in repeatedly: a 30-line Vite warning listing every import; complete `verify:*` JSON several times; full transcripts of 10+ agent runs.
  - Several shell attempts that failed the same way.
  - The whole history of two previous sprints.
- **When it started failing, with evidence:**
  1. **It repeated a mistake it had already corrected, four times.** Multi-line shell heredocs with regex backslashes got mangled. This was first fixed in week 3 and even written to memory ("write helper files with the Write tool instead"). It recurred in the mock-marker fix, the history-test fix, the `verify-chat` regex `(\d+)` → `(d+)`, and the client test helper.
  2. **It contradicted a rule in the master context.** It put a second component (`ReplyBody`) in `message-list.tsx`, against "one component per file", and dropped `role="log"`, which the tests relied on. It caught itself before committing.
  3. **It remembered wrongly.** It wrote "32 runs" and "4 self-correction runs" in `TASKS.md`. The real counts were 30 and 3 (corrected before committing `5324571`).
  4. **It wrote a result before it existed.** The demo script stated the self-correction retest had succeeded while it was still running (corrected before committing `e08c849`).
- **Symptom:** "repeats a corrected error", "contradicts a rule", "remembers wrongly". All three of the guide's signals appeared.
- **What I did:**
  - Caught each one with a check before committing: re-reading the file, counting from the source, waiting for the result.
  - Moved the noisy work (reliability runs, the B-10 implementation) into separate headless sessions, which is why sessions 1 and 2 exist.
  - The session never compacted or restarted. It survived because every claim was re-verified against files and git, not against what it remembered.

## Session 4: the long-session test, B-08 delegated (2026-10-01)

- **Task:** B-08 conversation persistence, delegated to one session for its whole life. Plan, 8 steps and PO decisions took 15 turns over 2 h 44 min, with ≈ 39 min of active work (`docs/evidence/long-session-test.md`).
- **What it loaded:** the routine worked on the reading side. Turn 1 read the ADR index plus two ADRs (4.6k of 12.4k characters), and `BACKLOG.md` only for B-08.
- **When it started failing:**
  - It didn't degrade in quality: none of the routine's signals appeared.
  - The **process** slipped twice:
    1. A background `check` in a headless session died with the reply, so the plan wasn't committed.
    2. The context crossed 80k at step 5 and reached 125.6k before anyone measured it.
- **Symptom:** none in the code. The risk was invisible until the transcript was profiled.
- **What I did:**
  - compacted 4 times (each to about 10–13k), the last two automatically
  - added "headless → foreground" and "measure after every turn" to the routine
  - resumed across a 2-hour usage-limit outage by compacting with the interrupted step's state

## Session 5: blind delegation of B-11 to the subagent, three passes (2026-10-01 → 02)

- **Task:** build B-11 from a delegation contract, one fresh `feature-builder` session per pass (`docs/evidence/b-11-delegation-record.md`).
- **Size:**

  | Pass | Turns | Time   | Context peak       | Cost     |
  | ---- | ----- | ------ | ------------------ | -------- |
  | 1    | 224   | 24 min | **199,418** tokens | USD 5.65 |
  | 2    | 266   | 26 min | **232,524**        | USD 6.74 |
  | 3    | 62    | 17 min | 81,106             | USD 1.46 |

  No compaction in any pass.

- **What it loaded:** whole-delegation passes, in one reply each. Pass 2's tool results alone were 279,862 characters.
- **When it started failing:** quality held in the code, but **verification discipline slipped**. In pass 2, at the high end of its context, the agent saw a test fail once, reran it, and moved on: "a second failing test I didn't identify". That same pass shipped a check that was flaky under load.
- **Symptom:** an intermittent failure normalized as noise, which is a quiet version of "it degraded and you didn't notice".
- **What I did:**
  - a narrow Amendment 2 (root cause, deterministic reproduction, 10 passing runs), which pass 3 met at 81k tokens
  - new rules: size passes to the budget; treat intermittent failures as findings

## Session 6: the orchestrating session, again (2026-10-01 → 02)

- **Signal:** **it repeated a corrected error for the fifth time.** An inline `node -` script with regex backslashes was mangled by the shell, so one ADR commit didn't land. The correction has been in memory and in this log since Sprint 2 ("use the file tool for anything with backslashes").
- **What I did:** switched to the Edit tool for the change. The rule itself was already right; the session failed to apply it. That matches the routine's diagnosis: in a session this long, an old correction gets buried. It's another reason the PO session should stay thin and delegate. This sprint's code was all written by subagents, but the orchestrator still wrote scripts for its own checks.

## Session 7: the deployment subagent's diagnostic run (2026-10-02)

- **Task:** deployment Amendment 1, pass 2 (`feature-builder`, headless): run `netlify serve` locally and verify it.
- **Size:** 100 turns, 103k tokens at the end, $1.98.
- **What happened:** the local server wouldn't answer, so the agent ran `netlify serve --debug` to diagnose it, with the real `.env` loaded. `DEBUG=*` made the tooling print the resolved environment, real key included, into a background-task log. That server then **outlived the session**: the PO session found it still running, with the key in its environment, listening on every interface (`::`:8888). The agent reported the leak itself, at the top of its delivery.
- **Symptom:** none of the routine's four signals. This is a new class of failure: **a diagnostic step with a side effect on secrets**. No rule mentioned debug output, and the deny list only covers _reading_ `.env`, not printing what a tool loaded from it.
- **What I did:**
  - stopped the server;
  - found every local file holding the real key (3, counted against `.env` without printing it) and deleted the two temp ones;
  - asked the PO to rotate the key.
  - Amendment 2 made the local production run **structurally unable** to hold a secret: `serve:prod` blanks every secret, refuses debug flags and variables, and `verify:prod:local` always stops its server, in the foreground. It ran at 83k tokens.
  - Two new Forbidden rules in `CLAUDE.md` (`75040ea`).
  - Correcting the memory: "background tasks die with the reply" holds for commands, **not for servers**.
- **Also seen while verifying:** from PowerShell, `npm run serve:prod -- --debug` loses the `--`, so npm swallows `--debug` and the server starts normally (secrets still blanked; it had to be stopped by hand). The refusal itself works from Bash, and `verify:prod:local` takes no arguments, so it's the documented path.

## The pattern

| Cause                                                                                    | Seen in                                     | Cost                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| Reading whole documents "to understand" (ARCHITECTURE.md, BACKLOG.md)                    | Sessions 1 and 2, and every reliability run | 3,200 + 1,400 tokens per session, before the task starts        |
| One chained `cat` of several files                                                       | Session 2                                   | 69 % of all tool output in a single call                        |
| Full command output kept in the conversation (warnings, passing test logs, JSON reports) | Session 3                                   | Crowded out earlier corrections, so the same mistake came back  |
| One session for many tasks                                                               | Session 3                                   | Mistakes and stale numbers from hours earlier stayed in context |

The guide predicted it, and it holds: **large outputs entering the context, displacing what mattered.** Here that was mostly whole files. In the long session it was also old attempts.
