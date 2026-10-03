# Portability test (Day 9)

**Question:** can the harness be installed in a new, empty project using only `HARNESS.md`, and does it then steer an agent to produce something that works?

**Answer:** yes, on the fourth attempt. The first three each stopped on a gap in the manual or the kit, and each gap was fixed in the repository before the next attempt. The fourth installed cleanly, and a fresh session then built a working CLI the harness way: plan, approval, one commit per step, evidence.

## Setup

- A folder outside any git repository, holding only a copy of `HARNESS.md` and `harness-kit/`, plus an empty project folder `splitr/`.
- Every session was a fresh headless Claude Code session started in `splitr/`, told to follow **only** `../HARNESS.md`.
- The PO prompt gave only the decisions the manual says are the PO's:
  - **Product:** Splitr, a CLI that splits a restaurant bill.
  - **Stack:** Node 22, strict TypeScript, tsx, Vitest, Prettier, no linter.
  - **Backlog:** the first item, B-01, with three acceptance criteria.
- Permissions: exactly the ones the manual's "Before you start" section listed at that point.

## Attempts

| #   | Turns | Cost  | Wall    | Where it stopped                                                                                                              | Fixed in                                       |
| --- | ----- | ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | 38    | $0.86 | 1,670 s | Step 2: copying the kit into the project and running it needed permissions nobody had listed                                  | `2049082`, `c0bed3a`, `b0738f8`                |
| 2   | 5     | $0.22 | 23 s    | Before step 1: the agent couldn't read `../HARNESS.md` or `../harness-kit` (Claude Code reads only its own folder by default) | `2686672`                                      |
| 3   | 27    | $0.69 | 110 s   | Step 3: the permission rule `Bash(node ../harness-kit/:*)` doesn't match, because a rule must name the script                 | `e4b01dc`                                      |
| 4   | 59    | $1.25 | 242 s   | **Completed steps 1–6**: `Harness OK.`, `check` passing, `chore: install the agent harness`                                   | `924b651`, `63b4603`, `2cd1d20` (its findings) |

### What each failed attempt taught the manual

- **Attempt 1:**
  - Run the kit **in place**; never copy it into a project.
  - The kit's templates contained `.claude/skills/`, which Claude Code discovers in nested folders. A repository holding the kit, Compass included, could pick up duplicate `audit` and `release` skills. Templates now store `dot-claude/`, and the installer renames it on the way in.
  - Also added: list the permissions before installing; `check` must pass on an empty project; a non-web example; pinned versions; the `ABC-01` criterion ID format.
- **Attempt 2:** the agent needs `--add-dir` (or `/add-dir`) for the folder holding the kit.
- **Attempt 3:** the manual now prints the exact headless flags.
  - The three commands move **before** the installer, which only reports missing ones.
  - It calls out `npm init`'s failing `test` script and its `commonjs` type.
  - It covers `tsc` with no input.
  - `format` runs after installing.
  - It notes npm 11's skipped install scripts (`esbuild` under `tsx`).
- **Attempt 4**, although it succeeded, found:
  - **a real bug in `audit-validate`, also in Compass:** IDs padded by Prettier weren't recognized. The kit's template showed 10 of its 14 criteria;
  - the kit's dependency check flagged `typescript`, which projects use only through `tsc`;
  - Windows CRLF line endings fail the format check on a fresh clone (now `.gitattributes`);
  - template wording that assumed a web app with a linter.

## Step 7: the installed harness steering a new session

Two more fresh sessions in the installed project, with no instructions beyond its own `CLAUDE.md`.

| Session                        | Request                                 | What the agent did                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan (14 turns, $0.42, 127 s)  | "Work on B-01."                         | Wrote `docs/plans/B-01-split-a-bill.md`, a four-step table mapped to the criteria, and **stopped for approval**. It stated criterion 2 as an invariant on the outcome (`share × people ≥ total + tip`, and one cent less wouldn't cover it). It asked 10 questions the criteria didn't answer, each defaulting to an error rather than quietly changing what the user typed: decimal commas, `1e3`, fractional people. |
| Build (45 turns, $1.22, 221 s) | "Approved, with your proposed answers." | Five commits, one per step: plan, maths in whole cents with ADR-03, strict parsing, the CLI, and evidence with B-01 set to `done`. It reported each criterion with its evidence, plus one decision outside the plan (a 20 s CLI test timeout), with its reason.                                                                                                                                                        |

Every behavior the harness is meant to produce appeared in a project it had never seen:

- the plan before code, and waiting for approval;
- the criteria mapped to steps;
- an invariant instead of per-element limits;
- product questions asked, not decided quietly;
- an ADR for a design decision;
- one commit per step;
- evidence per criterion, and decisions reported.

## The PO's independent verification

Run by the PO session, not taken from the agent's report:

| Check                                | Result                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `git log`                            | `a6c8e75` install → `516ded8` plan → `5b85aae`, `d576fd0`, `4c09d38` steps → `1708e6f` evidence; the tree is clean |
| `npm run -s check`, 3 times in a row | 3/3 passed, 52 tests each                                                                                          |
| `npm run -s split -- 100 15 4`       | `Each pays 28.75`, exit 0 (criterion 1)                                                                            |
| `npm run -s split -- 10 0 3`         | `Each pays 3.34`: 3.333… rounded **up** (criterion 2)                                                              |
| `npm run -s split -- abc 15 4`       | `Error: total "abc" is not a number`, exit 1 (criterion 3)                                                         |
| `npm run -s split -- 100 15 0`       | `Error: people must be at least 1`, exit 1 (criterion 3)                                                           |
| `node ../harness-kit/doctor.mjs .`   | `Harness OK.`                                                                                                      |
| `BACKLOG.md`                         | B-01 `Status: done`                                                                                                |

## Totals

- **Six sessions:** four install attempts, then plan and build.
- **Cost:** $4.66 in total, $2.89 of it for the final successful run (install, plan and build).
- **Fixes:** eight commits to the manual and kit, each traced to the attempt that exposed it.

The transcripts are in the PO session's scratchpad (`portability/`), not committed.
