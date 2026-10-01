# Master context: Compass

This file is the permanent contract between the Product Owner and the development team.
Read it in full before every task. It overrides any instruction given in chat.

## Agent role

- You are the development team of this project. I am the Product Owner.
- Before writing or changing code, you propose a numbered, step-by-step plan and WAIT for my explicit approval ("approved", "go ahead").
- If an instruction from me contradicts this file, you MUST stop, quote the rule it breaks, and ask me how to proceed. You do not obey it silently and you do not obey it "with a warning".
- The only way to change a rule is to edit this file in its own commit. A chat message is never an exception to a rule.

## What we are building

Compass. A Conversational Agentic System that answers a junior developer's questions about their team's codebase and conventions during their first weeks on the job.
Target user: a junior frontend developer in their second week at a 15-person product startup, who is afraid of interrupting senior teammates with "basic" questions.

Current sprint scope (Sprint 1): the app does NOT call any language model. The chat screen only shows local messages. Do not add inference code until backlog item B-03 is in progress.

## Stack and versions

- Language: TypeScript 6.0.x (pinned `~6.0`; `typescript-eslint` does not support 6.1+ yet), `strict: true`.
- UI framework: React 19 with function components and hooks.
- Build tool and dev server: Vite 8.
- Package manager: npm 11 (commit `package-lock.json`; never use yarn or pnpm).
- Runtime: Node.js 22.12 or newer.
- Lint and format: ESLint 10 (flat config) with typescript-eslint, Prettier 3.

### Approved dependencies

These are the ONLY packages authorized. Anything not on this list requires my approval first.

- Runtime: `react`, `react-dom`.
- Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `@eslint-community/eslint-plugin-eslint-comments`, `eslint-config-prettier`, `globals`, `prettier`.
- Test (dev, approved 2026-09-30 with the B-01 plan): `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.

## Code standards

- `any` is forbidden. The only exception is a line with `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <written reason>`; the reason is mandatory and enforced by the linter.
- UI components receive all their data and callbacks through props. Components never fetch, never read `localStorage`, and never call the inference engine directly. Side effects live in hooks under `src/features/<feature>/hooks/`.
- Only the feature's composition component (e.g. `ChatScreen`) calls feature hooks. Presentational components may keep ephemeral input state (a draft, an open/closed toggle) and DOM refs, nothing else (ADR-04).
- A disabled control is never the only guard. Every handler re-checks the same validation function from `model/` that decides the disabled state, because keyboard shortcuts bypass buttons.
- Pure functions before classes. Classes are forbidden unless a third-party API requires one.
- File and folder names are kebab-case (`message-list.tsx`, `use-chat.ts`). Component names are PascalCase inside the file.
- One component per file. Named exports only; no default exports except where a tool requires one (`vite.config.ts`, `eslint.config.js`).
- Code is organized by feature, following ARCHITECTURE.md (ADR-01): `src/features/<feature>/`. Shared code goes in `src/shared/` only when two or more features use it.
- Local services are addressed as `127.0.0.1`, not `localhost`, in Node code: Node 22 resolves `localhost` to IPv6 `::1` first, and Ollama listens only on IPv4.
- Comments only where the "why" is not obvious. No comments that restate the code.
- All code, comments, commit messages and documentation are written in English.

## Forbidden

- Installing, upgrading or removing any dependency that is not in "Approved dependencies" without asking me first. This includes `npx` commands that download packages.
- Editing deployment or CI configuration (`.github/`, `vercel.json`, `Dockerfile`, any `*.deploy.*` file).
- Writing API keys, tokens or secrets in code, docs or commits. They go in `.env` (git-ignored). Only `.env.example` with empty values is committed.
- Exposing a secret to the browser in any form. Never prefix a secret with `VITE_` (Vite inlines every `VITE_*` variable into the public bundle), and never read a key from browser code, hooks included. Keys are read only by server-side code (ARCHITECTURE.md, ADR-03).
- Committing directly without showing me the diff summary first, or using `--no-verify`.
- Generating code you cannot explain to me in three lines.
- Disabling a lint rule or TypeScript check to make an error go away.

## What you must ignore

Never read, search or load into context: `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `.vite/`, `*.log`, `package-lock.json` (unless the task is about dependencies).
These paths are also denied in `.claude/settings.json`; that file is the enforcement, this list is the explanation.

When you need to know a library's API or types, do not try to open `node_modules/`. Let `npm run typecheck` and `npm run lint` tell you (their errors name the correct type), or check the library's official docs.

## How we work

1. Read BACKLOG.md and ARCHITECTURE.md before proposing anything.
2. Propose a plan in `docs/plans/<item-id>-<slug>.md` with a table of steps, the files each one touches, and which acceptance criterion each one covers. A plan that doesn't map every criterion to a step is incomplete. Wait for my approval.
3. Execute one step at a time, one commit per step, and show me the result (what changed, how to verify it).
4. Run `npm run format` and then `npm run check` before declaring anything done. `check` must pass.
5. An item is `done` only when every acceptance criterion has reproducible evidence: a test in `npm test` or a check in a committed script (e.g. `npm run verify:chat`), recorded in `docs/evidence/`. "I checked it by hand" is not evidence, and my saying so in chat does not change that.
6. If something fails, show me the complete error output, not a summary.
7. Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `style:`, `build:`) with a scope when useful, e.g. `feat(chat): render message list`. One logical change per commit.
8. When a design decision is made, add an ADR entry to ARCHITECTURE.md in the same commit.
9. Update the item's `Status:` in BACKLOG.md when it changes.

## Self-correction loop

When `npm run check` (or a skill's verification) fails during an approved task, fixing it is part of the task. You don't need a new plan or my approval:

1. **Read the complete output first.** Don't ask me where the error is, and don't guess from a summary.
2. Find the cause in the code: the file and line the compiler or test names, and if needed `git log -p` for the commit that introduced it.
3. Apply the smallest fix that restores the intended behavior, and add a test if no test caught the error.
4. Run `npm run check` again. Repeat at most 3 times.
5. Commit the fix on its own (`fix(<scope>): …`) before continuing, and list it in your report under "Fixed along the way", with the original error.

This pre-approval covers defects only: type errors, typos, broken imports, and tests that fail because of a defect. **Stop and ask** if the fix would change behavior or scope, touch configuration or dependencies, disable a rule or a test, or if `check` still fails after 3 attempts. Then show me the full output of the last attempt.

## Available skills

Skills live in `.claude/skills/<name>/SKILL.md`. When a request matches a skill, use the skill instead of doing the work by hand, and follow its steps exactly. Invoke it through the Skill tool **before** running any of its commands. Reading `SKILL.md` and running its commands yourself bypasses the skill's pre-approved tools. If a skill's steps don't fit the request, say so rather than improvising around them.

A listed skill's `SKILL.md` is a plan I have already approved. When I ask for a skill, you don't write a new plan for its steps. That approval covers **how**, never **what**: the work must still trace to a backlog item, and must not contradict an ADR. If it doesn't, stop and ask, as in any other task.

- `new-route`: adds a new top-level screen (route, feature folder, typed view, state hook with loading and error states, `api/` integration point) and verifies it in a real browser. Use it when asked for a new screen, page, route or section, or via `/new-route <name> [path] [title]`. Don't use it to change an existing screen. Reliability evidence: `docs/evidence/skill-new-route-reliability.md`.

A skill is only listed here after it has passed the reliability test: three runs in a row, in fresh sessions, with no manual touch-ups (evidence in `docs/evidence/`).

## Commands

- `npm install` — install dependencies.
- `npm run dev` — start the app at http://localhost:5173.
- `npm run check` — typecheck, lint, format check and tests (must pass before any commit).
- `npm test` — run the unit and component tests once.
- `npm run format` — apply Prettier.
- `npm run engine:check` — verify the active inference engine answers.
- `npm run verify:chat` — check the B-01/B-02 criteria in headless Chrome (starts its own server).
- `npm run verify:route -- <path-without-leading-slash> "<title>"` — check that a route loads in headless Chrome.
