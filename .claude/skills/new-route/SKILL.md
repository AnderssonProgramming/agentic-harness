---
name: new-route
description: Adds one new screen to Compass (a route in src/app/routes.ts plus a feature folder with a typed view, a state hook with loading/error states, and an api/ integration point that returns placeholder data), then verifies it with the checks and a real browser. Use when the user asks for a new screen, page, route, view or section of the app, e.g. "add a settings screen", "create a page for the knowledge base", "I need a route for X", or "/new-route knowledge". Do NOT use to change an existing screen, to add a component inside an existing screen, or to connect a real API or the model (that is the conversational-connection skill).
argument-hint: <name> [path] [title]
allowed-tools: Read, Grep, Glob, Bash(node .claude/skills/new-route/scaffold.mjs:*), Bash(npm run format), Bash(npm run check), Bash(npm run verify:route:*), Bash(git status:*)
---

# new-route

## When to use it

Someone needs a new top-level screen in the app's navigation. The skill produces the same structure every time (ADR-01, ADR-06, ADR-07), so the only decisions are the inputs below.

## Inputs

| Input     | Required | Rule                                                                                                                                                                                   | Default                                   |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `name`    | yes      | kebab-case, 2–30 characters, starts with a letter (`knowledge`, `team-conventions`)                                                                                                    | none                                      |
| `path`    | no       | lowercase letters, digits, hyphens and slashes; **pass it without the leading slash** (`conventions`, not `/conventions`); never the root `/`                                          | same as `name`                            |
| `title`   | no       | at most 40 characters; shown in the navigation, the heading and the browser tab; must be unique                                                                                        | `name` in Title Case (`Team Conventions`) |
| `purpose` | no       | one sentence shown on the screen until real data exists. Use the user's own words; never write one yourself. If the request names a backlog item, end with it in parentheses: `(B-06)` | exactly `Coming soon.`                    |

With `/new-route`, arguments come in that order: `/new-route team-conventions conventions "Team conventions"`.

When the request is in words, derive `name` from the main noun: "a screen for team conventions" → `team-conventions`; "a settings page" → `settings`. Take `purpose` from the user's description of what the screen is for, keeping their words. **State the derived inputs in your report.**

Scope comes from the backlog, not from this skill (see "Available skills" in CLAUDE.md). The screen must trace to a backlog item: one the user names, or one whose story clearly describes this screen.

Stop and ask, don't guess, when:

- there is no noun you can turn into a name ("add a new page"),
- the user's words suggest changing an existing screen rather than adding one,
- no backlog item covers the screen. Offer a draft item, but don't write it, or
- the screen would contradict an ADR or a backlog criterion. For example, a UI to pick the inference engine contradicts ADR-03 and B-04, which say the engine is chosen by environment variable.

## Steps

Run every command from the repository root exactly as written: one command per call, no `cd … &&` prefix and no chaining. Chained commands need separate approval, and the pre-approved commands (in `.claude/settings.json`) only match the plain form.

1. Read `src/app/routes.ts`. If `path` is already registered or `src/features/<name>/` exists, stop and report which one. Never overwrite.
2. Run the generator with exactly these flags (quote `title` and `purpose`):
   ```bash
   node .claude/skills/new-route/scaffold.mjs --name <name> --path <path-without-leading-slash> --title "<title>" --purpose "<purpose>"
   ```
   It validates every input before writing. On error it prints `new-route: <reason>` and `Nothing was changed.`, exits 1, and you stop and report the reason. On success it prints JSON listing the files it created and modified.
3. Run `npm run format`.
4. Run `npm run check`. If it fails, show the **full** output. You may fix only files listed in the generator's JSON; then rerun. After 2 failed attempts, stop and report. Never disable a lint rule or a test to make it pass.
5. Run the browser verification, using the `verify` command from the generator's JSON:
   ```bash
   npm run verify:route -- <path-without-leading-slash> "<title>"
   ```
   It starts its own dev server and headless Chrome. It prints JSON with one result per check and exits 0 only if all pass. If it fails, show the full JSON and treat it like step 4.
6. Run `git status --short` and confirm the only changes are the files in the generator's JSON.
7. Report back (do not commit, per CLAUDE.md the PO sees the diff summary first):
   - the inputs used, marking any you derived
   - the created and modified files
   - `check`: pass/fail with the test count
   - `verify:route`: each check with PASS/FAIL

## Output

- New folder `src/features/<name>/`:
  - `index.ts` exports `<Name>Screen` only
  - `model/<name>.ts` has the `<Name>Data` type, the `<NAME>_TITLE` constant and placeholder data
  - `api/<name>-api.ts` has `load<Name>(): Promise<<Name>Data>`, the integration point (ADR-07)
  - `hooks/use-<name>.ts` holds the state `loading | ready | error` and `reload()`, plus a test
  - `components/<name>-view.tsx` is presentational (props only), plus a test
  - `components/<name>-screen.tsx` is the composition component that calls the hook
- `src/app/routes.ts` gets one import and one route entry, inserted above the marker comments.
- Nothing is committed.

## Verification

- [ ] `npm run check` exits 0: the types compile, lint is clean, and the generated tests pass.
- [ ] `npm run verify:route -- <path> "<title>"` exits 0: the route loads by URL and by nav click, the heading and tab title match, the nav link is current, and there are no console errors.
- [ ] `git status --short` shows only the generator's files.

## Known errors

| Symptom                                                                                                       | Cause                                                                                                                                                                                                                                                                              | What to do                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `looks like a path converted by Git Bash`                                                                     | On Windows, Git Bash rewrites arguments that start with `/` into Windows paths (`/x` → `C:/Program Files/Git/x`)                                                                                                                                                                   | Pass the path without the leading slash. Both scripts add it back.                                                                                                            |
| `The path /x is already registered` or `src/features/x/ already exists`                                       | The screen exists                                                                                                                                                                                                                                                                  | Stop. Ask whether to pick another name or change the existing screen (not this skill's job).                                                                                  |
| `The marker comments in src/app/routes.ts are missing`                                                        | Someone edited `routes.ts` and removed `// new-route: …` lines                                                                                                                                                                                                                     | Restore both marker comments (see ADR-06) in a separate commit, then rerun.                                                                                                   |
| `verify:route` fails with `Chrome did not start`                                                              | Chrome isn't at the default Windows path                                                                                                                                                                                                                                           | Set `CHROME_PATH` to the Chrome executable and rerun step 5.                                                                                                                  |
| A command returns `This command requires approval` in a headless (`claude -p`) session                        | The command isn't in the `allow` list of `.claude/settings.json`, or it was chained (`cd … && …`)                                                                                                                                                                                  | Run it in the plain form from the repository root. If it's genuinely new, ask the PO to add it to the allow list; never work around it.                                       |
| `Execute skill: new-route` is denied, or allowed commands still say `requires approval`, in a **fresh clone** | Observed in the reliability test: in a folder that has never been opened interactively, the project's `allow` rules in `.claude/settings.json` weren't applied (its `deny` rules were). A `/new-route` slash command still worked, because the skill's own `allowed-tools` applied | Open the folder once with `claude` and accept the trust prompt, or, for headless runs, pass `--allowedTools "Skill(new-route)"`. Never broaden permissions to work around it. |
| The request arrives as `C:/Program Files/Git/new-route …`                                                     | `claude -p "/new-route …"` typed in Git Bash: the shell rewrote the slash command before Claude saw it                                                                                                                                                                             | Treat it as `/new-route …`. To avoid it, run `MSYS_NO_PATHCONV=1 claude -p "/new-route …"` or type the command inside Claude.                                                 |
