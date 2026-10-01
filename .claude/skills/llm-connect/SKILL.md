---
name: llm-connect
description: Generates the conversational connection to a language model for a Vite + TypeScript app. It adds a server-side chat endpoint mounted in Vite (API keys never reach the browser), engine adapters for Anthropic, Ollama and a deterministic mock, streaming as NDJSON, history trimming, a typed browser client (streamChat) that maps every network and API failure to an error code with a user-facing message, tests, and an end-to-end check. Use when a project needs to talk to an LLM for the first time, e.g. "connect the app to the model", "generate the LLM client", "add the chat endpoint", or "/llm-connect". Do NOT use to wire the client into a screen (that's feature work with a plan), to update or extend an existing connection, or to add another provider.
argument-hint: "<backlog item ID>" [--route api/chat] [--default-engine anthropic|ollama|mock]
allowed-tools: Read, Grep, Glob, Bash(node .claude/skills/llm-connect/scaffold.mjs:*), Bash(npm run format), Bash(npm run check), Bash(npm run verify:llm), Bash(git status:*), Bash(git check-ignore:*)
---

# llm-connect

## When to use it

The project has a chat UI (or will have one) and no connection to a model yet. After this skill, `streamChat(history, { onDelta })` works from the browser and the server holds the keys. Wiring it into a screen is the next, separate task.

## Inputs

| Input             | Required | Rule                                                                                                                                                 | Default           |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| backlog item ID   | yes      | Must exist in `BACKLOG.md` and not be `done` (mechanical check, as in `new-route`)                                                                   | none              |
| `system`          | yes      | One paragraph telling the model who it is and for whom. **Take it from the user or from `CLAUDE.md` "What we are building"**; never invent a persona | none              |
| `route`           | no       | Endpoint path, **without the leading slash** (Git Bash rewrites it otherwise)                                                                        | `api/chat`        |
| `default-engine`  | no       | `anthropic`, `ollama` or `mock`. `INFERENCE_ENGINE` in `.env` overrides it at runtime                                                                | `anthropic`       |
| `anthropic-model` | no       | Model ID                                                                                                                                             | `claude-sonnet-5` |
| `ollama-model`    | no       | Model name as in `ollama list`                                                                                                                       | `phi3`            |
| `history-chars`   | no       | Most characters of history sent per call (2000–500000)                                                                                               | `24000`           |

Deriving `system` from `CLAUDE.md`: use the product sentence and the target user, plus one instruction about what the assistant must not pretend to know (e.g. team documents that aren't connected yet). State in the report that you derived it.

Stop and ask when:

- no backlog item ID is named, or it doesn't exist, or it is `done`
- `system` can't be taken from the user or `CLAUDE.md`
- `server/llm/`, `src/shared/llm/` or `scripts/verify-llm.mjs` already exist: this skill creates a connection, it doesn't update one

## Steps

Run every command from the repository root exactly as written: one command per call, no `cd … &&` and no chaining.

1. Check the backlog item ID mechanically (it exists and isn't `done`), and check that the three targets above don't exist.
2. Run the generator (quote `system`):
   ```bash
   node .claude/skills/llm-connect/scaffold.mjs --system "<system>" [--route <route>] [--default-engine <engine>] [--anthropic-model <id>] [--ollama-model <name>] [--history-chars <n>]
   ```
   It validates all inputs and every patch target before writing. On error it prints `llm-connect: <reason>` and `Nothing was changed.` and exits 1; stop and report. On success it prints JSON with `created` and `modified`.
3. Run `npm run format`.
4. Run `npm run check`. If it fails, read the **full** output first, then fix only files in the generator's JSON and rerun. Stop after 2 failed attempts. Never disable a rule or a test.
5. Run `npm run verify:llm`. It starts Vite with the plugin and checks the real endpoint:
   - the stream
   - that the history reaches the engine
   - typed API errors
   - a malformed request and a wrong method
   - an unreachable engine
   - a missing key, and an invalid key (a real Anthropic call that returns 401)
   - a live Claude reply using the history, if a key is set
   - a production build scanned for secrets

   It prints JSON with one result per check. If a check fails, treat it like step 4.

6. Review the secrets checklist, and put the answers in the report:
   - `git status --short` lists no `.env`
   - `.env` is in `.gitignore`
   - `.env.example` lists every variable with an empty key
   - the `secrets` check passed
7. Run `git status --short` and confirm that only the generator's files changed.
8. Report without committing:
   - the inputs (mark any you derived)
   - the created and modified files
   - `check` (with the test count)
   - each `verify:llm` result
   - the secrets checklist
   - next step: "wire `streamChat` into the chat screen with a plan"

## Output

- `server/llm/` (runs only on the server):
  - `config.ts`, `system-prompt.ts`, `vite-plugin.ts` (ADR-08)
  - `handler.ts`, the NDJSON protocol (ADR-09)
  - `engine.ts`: selection by `INFERENCE_ENGINE`
  - `engines/anthropic.ts` (SSE), `engines/ollama.ts` (NDJSON), `engines/mock.ts` (deterministic; `[mock:<code>]` simulates an error, `[mock:slow]` slows it down)
  - `history.ts`: validation and trimming
  - `errors.ts`: HTTP status and provider errors mapped to codes
  - tests
- `src/shared/llm/` (browser and server):
  - `protocol.ts`, `errors.ts` (codes, retryability, `describeChatError` for user-facing text), `lines.ts` (stream reader with cancellation)
  - `client.ts` (`streamChat`), with tests
- `scripts/verify-llm.mjs`, and `npm run verify:llm`.
- Patches: `vite.config.ts` (plugin), `tsconfig.node.json` (includes `server`), both tsconfigs (`allowImportingTsExtensions`, because Vite's native config loader needs explicit `.ts` imports), `eslint.config.js` (types-aware rules for `server/`), `package.json` (script), `.env.example` (missing variables only).
- Nothing is committed.

## Verification

- [ ] `npm run check` exits 0 (about 50 generated tests cover every error code).
- [ ] `npm run verify:llm` exits 0.
- [ ] Secrets checklist in the report is all yes.
- [ ] `git status --short` shows only the generator's files.

## Known errors

| Symptom                                                   | Cause                                                                                          | What to do                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `looks like a path converted by Git Bash`                 | Git Bash rewrote `/api/chat` into a Windows path                                               | Pass `api/chat` without the slash.                                                                              |
| `vite.config.ts: "plugins: [react()]" not found`          | The Vite config already has other plugins or a different shape                                 | Stop. Show the file to the PO; the patch is one import and one array entry, added by hand in a separate commit. |
| `verify:llm` `auth` check fails with `engine_unreachable` | No internet, so the real Anthropic call couldn't be made                                       | Rerun when online. Every other check is local.                                                                  |
| `verify:llm` `live` check is `skipped`                    | No `ANTHROPIC_API_KEY` in `.env`                                                               | Expected on a fresh clone. The PO adds the key to `.env` (never in chat), then reruns.                          |
| Vite warns `unsupported by configLoader: 'native'`        | An import reachable from `vite.config.ts` has no `.ts` extension                               | Add the extension. The generated files already have them.                                                       |
| `Execute skill: llm-connect` denied in a fresh clone      | The project allow rules don't apply in a folder never opened interactively (same as new-route) | Open it once with `claude`, or pass `--allowedTools "Skill(llm-connect)"` for headless runs.                    |
