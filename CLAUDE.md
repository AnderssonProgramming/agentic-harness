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

## How we work

1. Read BACKLOG.md and ARCHITECTURE.md before proposing anything.
2. Propose a plan. Wait for my approval.
3. Execute one backlog item at a time and show me the result (what changed, how to verify it).
4. Run `npm run check` before declaring anything done. It must pass.
5. If something fails, show me the complete error output, not a summary.
6. Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `style:`, `build:`) with a scope when useful, e.g. `feat(chat): render message list`. One logical change per commit.
7. When a design decision is made, add an ADR entry to ARCHITECTURE.md in the same commit.
8. Update the item's `Status:` in BACKLOG.md when it changes.

## Commands

- `npm install` — install dependencies.
- `npm run dev` — start the app at http://localhost:5173.
- `npm run check` — typecheck, lint, format check and tests (must pass before any commit).
- `npm test` — run the unit and component tests once.
- `npm run format` — apply Prettier.
- `npm run engine:check` — verify the active inference engine answers.
