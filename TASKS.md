# Candidate tasks for Custom Skills

How these were measured: wall-clock time between commits in the git history (`git log --date=iso`), plus the tool transcripts in `docs/evidence/`. Most of this work was done by the agent under the contract, so the minutes are **agent wall-clock time including failure loops**, not the time a person would take by hand (which would be several times longer). "Manual steps" counts the separate actions each run needed.

Score = times done × average minutes. It is the potential saving per sprint.

## [T-01] Add a new screen: route, view, state and API integration point

- Times done so far: 1 full screen (chat, B-01), built as 7 units (model, 2 hooks, 3 components, styles)
- Time: 36 minutes (commits `b830d50` 10:59 → `129e655` 11:35 on 2026-09-30); 28 of them were one failure loop on the composer
- Manual steps per screen: 9 (create model, create hook, create view, write 3 test files, register in `App`, format, check)
- Stable steps: yes. Every screen has the same layers (ADR-01, ADR-04), and only the names and content change
- How I verify it: `npm run check` passes and the screen loads in the browser without console errors
- Upcoming uses: B-06 knowledge base, B-07 source panel, a settings screen for the engine switch, and more in later sprints (~1 per week)
- Score: 1 × 36 = **36**
- Candidate: **yes, Skill 1 (Web track)**

## [T-02] Run a deliberate-violation contract test and record the evidence

- Times done so far: 8 (tests 1–7 plus the test-2 retest)
- Time: about 5 minutes each. Round 2 (3 tests) took 6 min 47 s end to end (`7f9f09e` 12:18:54 → `9fb7c1a` 12:25:41), including one failed run caused by a shell scoping bug
- Manual steps per test: 7 (fresh session, paste prompt, capture tool calls, check `git status`, write the evidence file, update the table, commit)
- Stable steps: yes. Only the prompt and the rule change
- How I verify it: the transcript shows the rule quoted, no forbidden tool call, and `git status` is clean
- Score: 8 × 5 = **40** (the highest)
- Candidate: yes. It's not the track skill, so it's the **Skill 3 candidate** (see the note below)

## [T-03] Close a plan step: format, check, commit

- Times done so far: 21 in week 2
- Time: about 1 minute each (`npm run check` takes 5–50 s)
- Manual steps: 3
- Stable steps: yes
- How I verify it: `check` exits 0 and the commit exists
- Score: 21 × 1 = 21
- Candidate: **no, as a skill.** It has no judgment and no inputs, so a git pre-commit hook fits it better than a skill. Parked for Sprint 3.

## [T-04] Verify acceptance criteria in a real browser

- Times done so far: 1 (B-01/B-02)
- Time: 18 minutes (`129e655` 11:35 → `174ff87` 11:53), mostly debugging a deadlock in the verification script
- Stable steps: not yet. It has been done once, and the checks differ per item
- Score: 1 × 18 = 18
- Candidate: **not yet.** "Don't automate what you've done once." The route skill reuses its browser-driving part for a fixed check (page loads, heading visible, no console errors).

## Decision

- **Skill 1 = T-01** (`new-route`), because it's the Web track skill and the second-highest score.
- **Skill 2** (week 4) is the conversational connection required by the sprint. It hasn't been done by hand yet, so week 4 does it by hand once first, then captures it.
- **T-02 scored highest but isn't the track skill.** Per the sprint guide it's recorded as the candidate for a third skill.

## Before and after

### [T-01] Add a new screen → `new-route` skill

|                             | Before (B-01, by hand with the agent, step by step)                                                                                                                                                     | With the skill                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Agent wall-clock            | **36 min** measured for the chat screen, of which 28 min was one failure loop; **~6 min** for the layered skeleton alone (model, hooks, view, screen, styles: `2366392` → `129e655` minus the composer) | **2.5 min** (146, 156 and 155 s in the reliability runs) |
| Browser verification        | 18 min the first time (writing and debugging the script), then manual per screen                                                                                                                        | Included: `verify:route` runs as step 5, 6 checks        |
| Manual steps / PO approvals | 9 steps, each needing a PO review before the next                                                                                                                                                       | **1 request**, one review of the final report            |
| Output consistency          | Depends on the session                                                                                                                                                                                  | Same 8 files, same structure, 3/3 runs                   |

- **Saving per use, conservative:** 3.5 min of agent time (6 → 2.5), plus 8 PO review turns. At about 2 minutes per review, that's ~16 min of PO time, for **~20 min per screen**. The 2 min per review is an estimate; the rest is measured.
- **Saving per use against the measured B-01 run:** 36 + 18 min → 2.5 min. That overstates it, because the chat screen had real features the skeleton doesn't.
- **Estimated uses:** ~1 per week (B-06, B-07 and a settings screen are candidates). That's **~20 min per week** conservatively.
- **Cost:** about USD 0.33–0.48 in model usage per run.

The largest saving isn't minutes but consistency: every screen arrives with the same layers, loading and error states, tests and a browser check, and the skill refuses to build what isn't in the backlog.
