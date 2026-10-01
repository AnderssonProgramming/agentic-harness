# Sprint 2 harness retrospective

Guiding question: **which task cost more than it should have?**

## 1. The task that keeps costing, with its measurement

**Running a skill's reliability test** (T-05 in `TASKS.md`): 30 runs this sprint plus 3 self-correction attempts, at about 5 minutes each, so a score of **165**. That's four times the previous top candidate. Each run is the same six steps:

1. a fresh clone
2. `npm ci`
3. a headless invocation with the right flags
4. an independent `check`
5. an independent `verify:*`
6. reading the transcript for denials and the order of tool calls

The scripts already exist in the scratchpad, which is the sign it's ready to be a skill. **It's the Skill 3 candidate for Sprint 3** (`skill-reliability`), ranked above the contract test (T-02, now 50).

Why it cost more than it should have: **five of the failed runs were bad test prompts, not bad skills.** In each one, the agent was right to refuse:

- a settings screen that contradicts ADR-03
- screens with no backlog item, twice
- custom options that contradict ADR-08, B-03 and B-04
- a placeholder change with no item and "no plan needed"

A `skill-reliability` skill should check its test conditions against `BACKLOG.md` and the ADRs **before** spending a run.

## 2. The steps added to a skill after its reliability test

| Skill       | What the test exposed                                       | What was added                                                                                             | Commit    |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| new-route   | Permission denials in headless mode, and a `cd … &&` prefix | Project allow list and the "plain commands only" step                                                      | `32451ec` |
| new-route   | An invented purpose sentence, and scope by judgment         | `purpose` must be the user's words or exactly `Coming soon.`; ADR conflicts and missing scope stop the run | `f815cb3` |
| new-route   | Clone sessions and the main repo disagreed on "for B-06"    | A mechanical scope check: an item ID that exists and isn't done is enough                                  | `824ea24` |
| llm-connect | Mock error markers fired again after merged turns           | The mock reads only the newest message                                                                     | `4216f77` |
| llm-connect | The secrets checklist command was denied                    | `git check-ignore` added to `allowed-tools`                                                                | `d3f986f` |

The pattern: **every touch-up became a written step, input rule or known error**, never a manual fix in the run.

## 3. The new rules in the master context this sprint

The rule that matters most, from the self-correction test (`d1d9029`):

> When `npm run check` fails during an approved task, fixing it is part of the task. You don't need a new plan or my approval. Read the complete output first, find the cause, apply the smallest fix, run check again (at most 3 times), and commit the fix on its own. This covers defects only; scope, configuration or dependency changes still stop and ask.

Without it, the agent found the deliberate error on its own but stopped to ask, because "no code without a plan" covered fixes too. With it, the agent found the error, fixed it in a separate commit and re-ran `check` without asking (`docs/evidence/self-correction-loop.md`).

Other rules added this sprint, each from a run that went wrong:

- **Approved skills stand as plans, not as scope** (`ee7e527`): a skill run needs a backlog item, but not a new plan.
- **Invoke a skill before running its commands** (`5cc70ad`): reading `SKILL.md` and running its commands by hand bypasses its `allowed-tools`.
- **Plain shell commands only** (moved from the skills into "How we work"). This was **the instruction repeated most**: chained `cd … &&` commands were denied in 10 runs across both skills.
- **Import extensions**: explicit `.ts` only in `server/**` and `src/shared/llm/**`, because Vite's native config loader requires it.
- **Current state**: the Sprint 1 line "the app does NOT call any language model" was replaced. Left as it was, it would have told a future session that the shipped feature was forbidden.

## Carried into Sprint 3

- Build `skill-reliability` (T-05), checking its test conditions against the ADRs before spending runs.
- Sprint 3 is about context control for long sessions. Evidence from this sprint: the longest agent run (self-correction attempt 3) took 38 turns and USD 0.96 for a small feature, and most of its first 13 calls were reading the same files the skills already know about.
- Open observation from `new-route`: derived names vary between sessions (`documents` vs `onboarding-documents`). Candidate rule: "use the full noun phrase".
- `phi3` answers correctly but takes ~17 s on CPU. Pull a faster local model before credits run out.
