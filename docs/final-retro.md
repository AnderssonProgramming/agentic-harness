# Final retrospective: eight weeks of the harness

Compass, Sprints 1–4. The question this answers: **what would I keep, drop and build next if I started a new project tomorrow?** The operating manual is [`HARNESS.md`](../HARNESS.md); this file is the judgment behind it.

## The three rules that saved the most time

1. **The self-correction loop** (`CLAUDE.md`, "Self-correction loop"). Before it existed, the agent found a broken `check` and stopped to ask, because "no code without a plan" also covered fixes. After it, defects were fixed in their own `fix:` commit and reported under "Fixed along the way", with no round trip to the PO. It's the rule that removed the most interruptions, every day, from Sprint 2 on (evidence: `docs/evidence/self-correction-loop.md`).
2. **Read narrowly: the ADR index, one backlog item, the files the plan lists** (`CONTEXT-ROUTINE.md`, step 3). Reading `ARCHITECTURE.md` and `BACKLOG.md` whole cost 3,200 + 1,400 tokens before every task. One chained `cat` was 69 % of a reliability run's context. Narrow reading kept typical sessions at 50–70k tokens, inside the budget, so sessions stopped degrading before the work was done (`CONTEXT-LOG.md`, "The pattern").
3. **Delegation contracts, sized to one session, verified independently** (`docs/delegations/`, `feature-builder.md`). Splitting the work into narrow passes cut a 232k-token pass to 81k, for a quarter of the cost. The required "Decisions I made that this contract didn't cover" list is where every product decision the agent took quietly showed up: silent data loss, a dropped second request, a prompt used as a control, and in week 8 a secret printed to a log. Reading that list first, and re-running the checks myself, is what caught them.

## What was discarded, and why

| Discarded                                              | Why                                                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| One long orchestrating session for a week's work       | Corrections got buried, and the same mistake came back four times; one session per task replaced it               |
| Letting the auditor reclassify risk and split findings | Two runs on the same code disagreed; the default risk plus PO triage made runs comparable                         |
| Per-element input limits                               | Bypassed twice through shapes nobody listed; replaced by invariants on the outcome, with property tests           |
| A system-prompt instruction as a control               | `phi3` claimed "I've set a reminder" with nothing stored; the app now makes the claim impossible                  |
| Manual build settings in the Netlify UI                | Not reviewable or repeatable; replaced by `netlify.toml` under an explicit exception                              |
| The `skill-reliability` skill (top-scored in Sprint 2) | Never built: delegation and the audit were worth more, and the scratchpad scripts covered the need                |
| `npx` inside skills                                    | It's on the "ask" list (it can download packages), so headless runs were denied; `npm run` wrappers instead       |
| Debug flags while real secrets are loaded              | Week 8: a `--debug` run printed the API key to a local log; local production runs now get blanked secrets         |
| Copying the kit into each project                      | The portability test showed it needs extra permissions and leaves nested skills behind; the kit now runs in place |

## What I'll build in the next 30 days

1. **Week 1: the first production release through `/release`**, after rotating the Anthropic key and finishing the one-time Netlify setup. Then three more releases, so `release` earns its place in `CLAUDE.md` like every other skill: three clean runs.
2. **Week 1: CI.** A GitHub Action running `npm run check` and `audit:facts` on every push. Today the gate runs only when someone remembers.
3. **Week 2: B-06**, so the model knows the team's documents (ADR-12 is already decided). It's the feature that makes Compass useful to its target user, and the first real test of the harness on a new feature after the course.
4. **Week 3: the harness on a second real project**, installed only from `HARNESS.md`. Every place the manual falls short gets fixed in the kit.
5. **Week 4: pay the debt whose triggers have fired.** D-03 (provider error bodies reach the browser) fired at deployment and was re-deferred once; it gets fixed with a new ERR-04 criterion. D-05 (`verify:chat` needs an existing screenshot folder) was due with the deployment scripts, and it cost the week 8 subagent a rerun.
