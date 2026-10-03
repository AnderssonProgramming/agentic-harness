# HARNESS.md: the operating manual

The harness is the set of files, permissions, skills and checks that make a coding agent (Claude Code) work like a disciplined development team for a Product Owner. It was built over eight weeks on **Compass**, the product in this repository, and then made portable in `harness-kit/`.

This manual is enough to install it in a new project and run it. If something here doesn't match what you see, the manual is wrong: fix it in the same commit as whatever you learned.

## What it is, in one paragraph

The agent is fast and literal. Without a harness it reads everything, decides product questions quietly, and reports "done" from memory. The harness puts three layers around it:

- **Layer 1, context:** what the agent knows and is allowed to touch.
- **Layer 2, skills and delegation:** repeatable work, done the same way every time.
- **Layer 3, verification and governance:** proof, not claims.

Each rule in it exists because something failed without it. The table in "Learned rules" lists the failure behind each one.

## Install it in a new project

You need Node.js 22+, git, and Claude Code. The kit doesn't create your app: it goes into an existing project with a `package.json`. **The kit is never copied into the project.** You run it from wherever it is (this repository, or a copy of `harness-kit/` elsewhere), and it writes into the project. Below, `<kit>` is the path to that folder.

### Before you start: permissions

If an agent does the install for you, start it **in the project folder** and give it read access to the kit and this manual. By default, Claude Code only reads the folder it was started in:

```sh
claude --add-dir <folder holding HARNESS.md and harness-kit/>
```

In a session that's already running, use `/add-dir`. In this repository, that folder is the repository root.

It also needs to run these without asking. In an interactive session, approve them when asked. In a headless one (`claude -p`), pass them as below, or the install stops at the first one. Name the scripts themselves: a rule that ends in a folder, such as `Bash(node ../harness-kit/:*)`, doesn't match.

```sh
claude -p "<your request>" --add-dir .. --permission-mode acceptEdits --allowedTools \
  "Bash(npm init:*)" "Bash(npm install:*)" "Bash(npm run:*)" \
  "Bash(git init:*)" "Bash(git add:*)" "Bash(git commit:*)" "Bash(git status:*)" \
  "Bash(node ../harness-kit/install.mjs:*)" "Bash(node ../harness-kit/doctor.mjs:*)"
```

(That example has the kit at `../harness-kit`; use your own path.) Nothing else is needed. The kit's own settings take over once it's installed.

1. **Create the project, its tools and a git repository.** Any npm project works. For example:
   - a web app: `npm create vite@latest my-app -- --template react-ts`, then `cd my-app` and `npm install`;
   - anything else (a CLI, a library): `npm init -y`, then fix what it assumes:
     - replace its `test` script, which always fails (`echo "Error: no test specified" && exit 1`);
     - set `"type": "module"` if you write ES modules (npm 11 writes `"commonjs"`).

   Then `git init`, and make sure `.gitignore` contains `.env`. On Windows, also add a `.gitattributes` with `* text=auto eol=lf`: otherwise git checks files out with CRLF endings and the formatter check fails on every fresh clone.

   Also install the formatter, linter and test runner that `check` will run, **now**, with exact versions (`npm install -D -E …`). Write those versions into `CLAUDE.md`'s "Stack and versions" in step 4: an unpinned install today may get a newer major than your examples assume. Once the kit is in, its settings put `npm install` on "ask": every later install needs your approval, and a headless session can't get one.

   If npm warns that a dependency's install script was skipped (npm 11 does this, e.g. for `esbuild` under `tsx`), approve it now if the tool needs it, and run the tool once to prove it works.

2. **Give the project the three commands the harness runs on every step,** before installing the kit. The installer only reports missing scripts; it doesn't write them.
   - `format`: the formatter writes files, e.g. `prettier --write .`
   - `check`: everything that must pass before a commit, e.g. `tsc --noEmit && eslint . && prettier --check . && vitest run`
   - `test`: the tests, once

   **`check` must pass on the install commit,** before any feature exists. Two tools fail on an empty project:
   - the test runner, with no tests: configure it to pass (Vitest: `passWithNoTests: true`);
   - `tsc`, with no input: include the runner's config file in `tsconfig.json`, or add one placeholder source file. TypeScript 7 with no input prints its help and exits 1, which looks unrelated.

   Run `check` now. If it doesn't exist, the agent has nothing to stop it from committing broken code.

3. **Install the kit into the project:**

   ```sh
   node <kit>/install.mjs <project dir> --name "My Product"
   ```

   Add `--profile netlify` if the project deploys to Netlify (see "Profiles"). The installer never overwrites an existing file; it lists the ones it kept. It adds the `audit:*` and `context:profile` npm scripts. **Then run `format`:** some installed files (in one test, the three `scripts/*.mjs`) won't match your formatter's settings, and `check` would fail on them.

4. **Fill in the fields.** Every `{{FIELD}}` in the installed files is a decision only you can make:
   - **`CLAUDE.md`:** what the product is and for whom, the stack with pinned versions, approved dependencies, code standards, commands. **Required before the first session.**
   - **`harness.config.json`:** the names of your secret env vars (the audit searches the build for them) and the build command and output folder (or `"build": null`).
   - **`BACKLOG.md`:** the first item, with criteria you can verify.
   - **`ARCHITECTURE.md`:** the first ADRs, as soon as you decide something.
   - **`AUDIT-CRITERIA.md`:** before the first audit, from the product's promises. Delete the criteria that don't apply (no build, no secrets, no storage). Criterion IDs must look like `ABC-01`, or `audit:validate` won't see them.

   `_TEMPLATE.md`, `TASKS.md`, `TECH-DEBT.md` and `CONTEXT-LOG.md` keep their fields; they're templates for later entries.

5. **Run the doctor:**

   ```sh
   node <kit>/doctor.mjs <project dir>
   ```

   It fails on any of these:
   - missing layer files;
   - unfilled fields in `CLAUDE.md`, the settings or the config;
   - missing npm scripts;
   - a `.env` that git doesn't ignore;
   - settings that don't deny reading `.env`.

   Fix until it says `Harness OK.` Then run `npm run check`: it must pass too.

6. **Commit the harness** on its own: `chore: install the agent harness`.
7. **Smoke-test it, in a new session.** Start `claude` in the project and ask for the first backlog item. The agent should:
   1. propose a plan in `docs/plans/` and wait;
   2. after your "approved", execute one step per commit, running `format` and `check` each time;
   3. report each criterion with its evidence.

   If it codes without a plan, `CLAUDE.md` isn't being read: check that it's at the project root. When an item adds a command the agent must run to verify it (e.g. `npm run split`), add it to `.claude/settings.json` → `allow` in the same commit. Otherwise every run asks, and a headless session stops there.

### Profiles

| Profile   | Adds                                                                                                                                                              | Use when                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| (core)    | Everything in layers 1–3 below                                                                                                                                    | Always                                    |
| `netlify` | The `release` skill, `scripts/release-gate.mjs`, `scripts/release-notes.mjs`, `scripts/release-deploy.mjs`, `docs/releases/DEPLOYMENTS.md`, and their permissions | The project ships to Netlify with the CLI |

The `netlify` profile needs three things from the project, and the doctor fails until they exist:

- `netlify-cli` as a dev dependency;
- a `netlify.toml` with the build settings;
- a `verify:prod` script that takes a URL and checks the deployed site end to end.

Compass's `scripts/verify-prod.mjs` is the example. List the PO-accepted advisory sources (`acceptedAdvisoryRoots`) and the code the audit must cover (`codePaths`) in `harness.config.json` → `release`.

Two of Compass's skills aren't in the kit, because they generate Compass-shaped code. They're kept as worked examples of how to write a skill with a scaffold, a verification script and _Known errors_:

- `new-route` (`.claude/skills/new-route/`)
- `llm-connect` (`.claude/skills/llm-connect/`)

## Layer 1: context

What the agent knows, in what order, and what it may touch.

| File                         | What it does                                                                                                                                                    | Who changes it, and when                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `CLAUDE.md`                  | The contract: role (plan first, wait for approval), product, stack, approved dependencies, code standards, forbidden actions, workflow, self-correction, skills | The PO, in its own commit, whenever a rule had to be repeated      |
| `CONTEXT-ROUTINE.md`         | How a session stays healthy: budget, one task per session, narrow reading, the signals to compact or restart, how to delegate                                   | The PO, when `CONTEXT-LOG.md` shows a new failure pattern          |
| `.claude/settings.json`      | **Enforcement**: what's denied (`.env`, `node_modules/`, build output, force-push, `--no-verify`), what asks (installs, `npx`), what's pre-approved             | The PO; a skill's commands are added when it's listed              |
| `BACKLOG.md`                 | The items, ordered, each with verifiable acceptance criteria and a status                                                                                       | The PO writes items; the agent updates `Status:`                   |
| `ARCHITECTURE.md`            | Decisions with their reason and the rejected alternative, behind a _Decision index_ that sessions read instead of the whole file                                | The agent proposes, the PO accepts, in the same commit as the code |
| `TASKS.md`, `CONTEXT-LOG.md` | Measurements: which tasks repeat (skill candidates), and where sessions degraded                                                                                | The PO, after measuring, before writing rules                      |

`CLAUDE.md` explains; `settings.json` enforces. Keep both: the explanation stops the agent from trying, and the denial stops it when it tries anyway.

## Layer 2: skills and delegation

Work that repeats, packaged so it runs the same way every time.

| Piece                                 | What it does                                                                                                                                                                                                          | How to run it                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/skills/audit/`               | Runs `AUDIT-CRITERIA.md` and writes a fixed-format report with default risks, validated by `audit:validate`. Never fixes or commits                                                                                   | `/audit`                                                                                                                              |
| `.claude/skills/release/` (`netlify`) | Gate (no open Critical, Highs accepted, clean and pushed, `check`) → version → notes → draft deploy → smoke test → **asks the PO** → publish that exact deploy → smoke test, rolling back on failure → record and tag | `/release patch` (or `minor`, `major`)                                                                                                |
| `.claude/agents/feature-builder.md`   | A subagent that builds one feature from an approved contract, in its own context, and reports per criterion plus "Decisions I made that this contract didn't cover"                                                   | `claude -p "Execute the approved delegation contract docs/delegations/<file>." --agent feature-builder --permission-mode acceptEdits` |
| `docs/delegations/_TEMPLATE.md`       | The contract: minimal context as a file list, decisions not up for debate, criteria as behavior, limits                                                                                                               | Copy it, fill it, set `Status: approved`                                                                                              |

**When to write a new skill:** when `TASKS.md` shows a task that repeats, has stable steps and a verifiable result. A skill is listed in `CLAUDE.md` only after **three runs in a row, in fresh sessions, with no manual touch-ups**, with the evidence in `docs/evidence/`. Every skill has _Inputs_, _Steps_, _Verification_ and a _Known errors_ table that grows with each failure.

## Layer 3: verification and governance

How anything is proven, and how risk is decided.

| Piece                               | What it proves                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                     | Types, lint, format and tests pass. Required before every commit                                                                                          |
| `verify:*` scripts (yours)          | Behavior end to end: a browser, an endpoint, stored data. An item is `done` only with a test or a committed script as evidence                            |
| `docs/plans/`, `docs/evidence/`     | The approved plan mapped to the criteria, and the reproducible proof for each                                                                             |
| `AUDIT-CRITERIA.md` + `audit:facts` | The fixed checklist, and the facts a script can establish: secrets in files and history, `.env` hygiene, secrets in the build, deps, licenses, advisories |
| `AUDIT-REPORT.md`, `docs/audit/`    | Every run's report, comparable with the last one                                                                                                          |
| `docs/audit/accepted-risks.md`      | Risks the PO accepted, by criterion, each with its debt entry. The release gate reads it                                                                  |
| `TECH-DEBT.md`                      | What isn't being fixed yet, why, and the condition that turns it into work                                                                                |

## The routine

**Every task:**

1. **One session, one task.** New task → `/clear` or a new `claude`.
2. **Plan first.** Name the backlog item and the files. The agent writes `docs/plans/<item>-<slug>.md`; check that every criterion maps to a step, then answer "approved".
3. **One step at a time.** For each step, the agent runs `format` and then `check`, commits, and reports. Confirm it before saying "next".
4. **Watch the signals.** Act on the first one:
   - a corrected error comes back;
   - a rejected decision is proposed again;
   - a rule is contradicted;
   - a number is misremembered;
   - the context passes 80k tokens or 40 turns.

   Restart, or `/compact keep: <plan>, <steps done with commits>, <next step>`.

5. **Close it:** the item is `done` only with evidence. Any rule you had to repeat goes into `CLAUDE.md`; a design decision goes into an ADR.

**A bigger feature:** write a delegation contract, run `feature-builder`, and verify independently:

- `check` several times;
- every `verify:*` under load;
- every named engine or platform, live.

Read the "Decisions I made" list first. Answer an unmet criterion with an amendment, not a hand fix. Size each pass to one session.

**Before a release:**

1. Run `/audit`.
2. Triage: the PO reclassifies risks if needed. Fix Criticals and Highs through delegations, or accept them in `accepted-risks.md` with a debt entry.
3. Run `/audit` again.
4. Run `/release`. It refuses to start while the gate fails, and it asks before publishing.

**After a sprint:** a short retro. Ask what you repeated, what the agent decided that you wouldn't have, and what the contract was missing. Each answer becomes a rule with its cause.

## Learned rules, and why they exist

Every rule below is in the kit's templates, and every one came from a failure in Compass.

| Rule                                                                                                                              | Where it lives                             | The failure that caused it                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Plan first, in a file, with every criterion mapped; wait for approval                                                             | `CLAUDE.md`, How we work                   | Without a written plan there was nothing to check "done" against (B-01)                                                     |
| `done` needs reproducible evidence; "I checked by hand" isn't evidence                                                            | `CLAUDE.md`, How we work                   | B-01's workflow made the default; contract test 5 then confirmed the agent refuses "mark it done" without evidence          |
| Run `format`, then `check`, before declaring anything done                                                                        | `CLAUDE.md`, How we work                   | New files failed `format:check` on essentially every B-01 step                                                              |
| A secret never reaches the browser in any form (no `VITE_` prefix, no key in hooks)                                               | `CLAUDE.md`, Forbidden                     | Asked to hardcode a key, the agent refused, then suggested a `VITE_` variable: the rule said "code", the leak was elsewhere |
| `CLAUDE.md` explains, `settings.json` enforces (deny `.env`, `node_modules/`, build output)                                       | `.claude/settings.json`                    | While building B-01's composer the agent tried to open `node_modules/` anyway; the denial stopped it                        |
| Don't open `node_modules/` to learn an API; the typechecker names the type                                                        | `CLAUDE.md`, What you must ignore          | A read denial cost nothing: `tsc` already named `SubmitEvent`                                                               |
| Use `127.0.0.1`, not `localhost`, for local services in Node                                                                      | `CLAUDE.md`, Code standards (Compass)      | Ollama looked down while running: Node 22 resolves `localhost` to IPv6 first                                                |
| A disabled control is never the only guard                                                                                        | `CLAUDE.md`, Code standards                | A test caught Enter bypassing the disabled button                                                                           |
| Self-correction: fixing a failing `check` is part of the task; at most 3 attempts, separate `fix:` commit                         | `CLAUDE.md`, Self-correction loop          | Without it, the agent found the error and stopped to ask, because "no code without a plan" covered fixes too                |
| Plain commands, one per call, no `cd … &&` chains                                                                                 | `CLAUDE.md`, How we work                   | One `cd … && cat …` chain was 69 % of a reliability run's context, and chained forms don't match the pre-approved commands  |
| Read narrowly: the ADR index and the ADRs you need, never whole files                                                             | `CONTEXT-ROUTINE.md`, step 3               | Two-thirds of a delegated session's context was spent before the first line of code                                         |
| One session, one task                                                                                                             | `CONTEXT-ROUTINE.md`, step 1               | One long orchestrating session repeated a corrected error four times                                                        |
| Numbers come from the source, never memory                                                                                        | `CONTEXT-ROUTINE.md`, step 7               | "32 runs" when there were 30; a result written before the run finished                                                      |
| Intermittent failures are findings, not noise                                                                                     | `CLAUDE.md`, Self-correction loop          | A check that failed 1 time in 4 under load was reported as "passed on rerun"                                                |
| Silently dropping user data or part of a request is a product question                                                            | `CLAUDE.md`, Delegation contracts          | A subagent chose to wipe unreadable data with no notice, and to ignore the second action in a request                       |
| A prompt instruction is never the control                                                                                         | `CLAUDE.md`, Delegation contracts          | The prompt said "never claim an action"; `phi3` replied "I've set a reminder" with nothing stored                           |
| Every engine or platform a criterion names gets a live run                                                                        | `feature-builder.md`                       | Every automated check passed on the mock; the failure only showed up live                                                   |
| Size delegation passes to the budget; a fresh session per pass                                                                    | `CONTEXT-ROUTINE.md`, `feature-builder.md` | Two passes peaked at 199k and 232k tokens (nobody compacts a subagent); a narrow pass ran at 81k for a quarter of the cost  |
| Write limits as invariants on the outcome, proven by a property-style test over shapes and sequences                              | `CLAUDE.md`, Delegation contracts          | Per-element limits passed every test and were still bypassed twice                                                          |
| The auditor reports the default risk and one finding per failed criterion                                                         | `audit` skill                              | Two runs on the same commit disagreed on risk and counts when the auditor could reclassify and split                        |
| Verification scripts write to a scratch folder                                                                                    | `CLAUDE.md`, Delegation contracts          | A verification run overwrote committed screenshots                                                                          |
| A skill is listed only after 3 clean runs in fresh sessions                                                                       | `CLAUDE.md`, Available skills              | First runs exposed invented content and scope decided by judgment                                                           |
| No debug or verbose environment output while a real secret is loaded; local production runs get blanked secrets through a wrapper | `CLAUDE.md`, Forbidden                     | A delegated `netlify serve --debug` printed the real API key into a local log; the key had to be rotated                    |
| Whatever starts a server stops it, in the foreground                                                                              | `CLAUDE.md`, Forbidden                     | A server a subagent started in the background outlived its session, holding the key and listening on every interface        |
| Deploy settings live in reviewed config, not in a UI                                                                              | `CLAUDE.md`, Forbidden (exception)         | Manual UI build settings were the one deploy step nobody could review or repeat                                             |
| Publish the exact deploy that was verified, and record what to roll back to                                                       | `release` skill                            | "Deploy then hope" can't promise that a failed deploy never leaves a broken version live                                    |

## What didn't work

Kept here so nobody tries it again.

| Tried                                                              | What happened                                                                                                          | Replaced by                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Rules written as what not to _write_ ("no secrets in code")        | The agent obeyed the letter and leaked elsewhere                                                                       | Rules about the outcome ("never reaches the browser"), plus enforcement                  |
| Scope decided by the agent's judgment ("is this in scope?")        | The same input was accepted in one session and refused in another                                                      | A mechanical check: an item ID that exists and isn't done                                |
| One long session for a whole week's work                           | Old corrections got buried; the same mistake came back; stale numbers                                                  | One session per task, with commits as the hand-off                                       |
| Background commands in headless sessions                           | Some died when the reply ended and lost their result; one server outlived the session instead, holding a secret        | Foreground with quiet flags in `claude -p`; servers only inside a script that stops them |
| Delegating a whole multi-layer feature in one pass                 | 199k–232k tokens, expensive, and weaker at the end                                                                     | Narrow passes plus amendments                                                            |
| Trusting the subagent's report                                     | Silent data loss and a flaky check were in it, described as fine                                                       | Independent verification: repeated, under load, live                                     |
| Letting the auditor reclassify risks and split findings            | Two runs on the same code weren't comparable                                                                           | Default risks only; the PO triages afterwards                                            |
| Per-element input limits                                           | Bypassed twice through shapes nobody listed                                                                            | Invariants on the outcome, with property tests                                           |
| Writing shell scripts with inline regexes through heredocs         | Backslashes were mangled again and again                                                                               | Write the script with a file tool, then run it                                           |
| Manual deploy settings in the hosting UI                           | Not reviewable, not repeatable                                                                                         | `netlify.toml` under an explicit, approved exception                                     |
| Copying `harness-kit/` into each project                           | It needed extra permissions, left a copy behind, and its nested `.claude/skills/` were discovered as the project's own | Run the kit in place; templates store `dot-claude/` (portability test, attempt 1)        |
| An install manual nobody had followed cold                         | Three fresh agents stopped at three different gaps before a fourth installed it                                        | Test the manual with a fresh agent in an empty folder, and fix it after every stop       |
| A `skill-reliability` skill (the top-scored candidate in Sprint 2) | Never built: delegation and the audit were worth more, and the scratchpad scripts were enough                          | Still a candidate in `TASKS.md`                                                          |

## Where Compass's own versions live

In this repository, the harness is installed and filled in for Compass. Use it as a reference implementation of every template:

- the live files at the root: `CLAUDE.md`, `CONTEXT-ROUTINE.md`, `CONTEXT-LOG.md`, `AUDIT-CRITERIA.md`, `TECH-DEBT.md`;
- the skills in `.claude/skills/`;
- the contracts in `docs/delegations/`;
- the evidence in `docs/evidence/` and `docs/audit/`;
- the retros in `docs/sprint-*-retro.md`.
