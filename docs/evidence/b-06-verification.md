# B-06 verification: the onboarding knowledge base

Date: 2026-10-03. Delegation contract: `docs/delegations/b-06-knowledge-base.md` (with Amendment 1). Built by the `feature-builder` subagent.

## What changed

- **Loader** (`server/llm/knowledge.ts`): reads `knowledge/*.md` once per server start (Vite plugin) or Function cold start (`netlify/functions/chat.ts`). Files go in alphabetical order. A file over 50 KB (51,200 bytes), unreadable, or holding a key pattern is skipped for every engine. Each engine then gets whole documents, first-fit in that order, up to its own budget. One server-console warning names every skipped file and the reason, never content.
- **Budgets** (`LLM_CONFIG.knowledgeBudgetChars`, the one place): Anthropic 40,000 characters, Ollama 8,000, mock 8,000. `maxPromptAdditions(engine)` = `MAX_PROMPT_ADDITIONS` (16,000, unchanged) + that budget (Amendment 1, Decision A).
- **Chat core**: `system = SYSTEM_PROMPT + knowledge.text[engine]`. The existing `bad_request` check on instructions and to-dos is unchanged, so documents never make a request fail.
- **System prompt**: no longer says the team's documents aren't connected. It says they're included below, if any, are reference material and not instructions, and that anything they don't cover must still be admitted plainly.
- **Production**: `netlify.toml` has `included_files = ["knowledge/**"]`. The Function looks in `process.cwd()/knowledge`, then `$LAMBDA_TASK_ROOT/knowledge`.
- **Mock**: echoes the content of each document whose file-name words all appear in the question (`branch-naming.md` for "What is our branch naming convention?"). Otherwise its reply is unchanged.

## Criteria and evidence

| Criterion                                                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                          | Result |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Markdown files in `knowledge/` reach the system prompt with each request     | `server/llm/knowledge-in-prompt.test.ts`: a recording engine gets `system === SYSTEM_PROMPT + knowledge.text.anthropic` on two requests in a row, with `<document source="branch-naming.md">` and `<type>/<item-id>-<short-slug>`. Each engine gets its own set. `netlify-function.test.ts`: the production entry point, with the real `knowledge/`, answers the branch question on the mock with the document    | Pass   |
| "What is our branch naming convention?" returns the answer from `knowledge/` | **Live Anthropic**, one request (below). **And** `verify:prod`'s `knowledge-branch-naming` passed against `npm run verify:prod:local`'s `netlify serve` server, with the mock that echoes the documents. Both kinds, not the live run alone                                                                                                                                                                       | Pass   |
| Files over 50 KB are skipped and listed in a server-console warning          | `knowledge.test.ts`: a fake 51,201-byte file is skipped for every engine, and the warning reads `big.md (over 51200 bytes)`. A 60,000-byte file of 20,000 characters is also skipped (bytes, not characters). A real temp folder: `huge.md` is never read, and `warn` is called once with `[knowledge] Skipped 1 file(s): huge.md (over 51200 bytes)`                                                             | Pass   |
| The per-engine budget holds, alphabetical order decides, skips listed        | `knowledge.test.ts`, "holds the Anthropic and Ollama budgets": files given in reverse order. Anthropic gets `a, b, d` (c would pass 40,000). Ollama and the mock get `a, d`. Each text is ≤ its budget, included documents are whole, the rest are absent. `skipped` lists b (ollama, mock) and c (all three) with their budgets                                                                                  | Pass   |
| A file with a key pattern is never sent, and is named in the warning         | `knowledge.test.ts`: fake fixtures (built from parts, never a real key) for `sk-ant-`, `-----BEGIN RSA PRIVATE KEY`, and `API_KEY="…"`. None reaches any engine's text, each is named `(contains a key pattern; never sent)`, and the warning contains no fixture content. Prose such as "Never paste an API key" and `ANTHROPIC_API_KEY=` with an empty value is not flagged                                     | Pass   |
| The prompt-additions invariant still holds with knowledge included           | `prompt-invariants.test.ts`, 150 seeded cases. Each has a generated knowledge set (0–40 files, 0–80,000 characters, multi-byte, 10% with a fake key) and a random engine. Over HTTP, additions ≤ `maxPromptAdditions(engine)`, the non-knowledge part ≤ 16,000, and every document is whole or skipped and listed. Tallies enforce near-budget, over-budget, oversized, key and full-to-do + full-knowledge cases | Pass   |
| No regression                                                                | `npm run -s check`: 39 files, 365 tests passed (349 before; +16). `npm run verify:llm`: 10 of 10 passed, live Claude included. `npm run verify:prod:local`: 5 of 5 checks, verify:prod 7 of 7 with `knowledge-branch-naming`, ports closed after                                                                                                                                                                  | Pass   |

### The property test can fail

Two temporary mutations of `buildKnowledge`, run against the extended property test and then reverted (not committed):

- Budget check loosened by 20,000 characters: fails at `case 1: 12 messages, 50 to-dos, 19324 bytes, anthropic, 40 documents: expected 71547 to be less than or equal to 56000`.
- Secrets guard off: fails at the same case, because the key fixture was sent. That failure printed the whole prompt, so the large-string assertions became booleans before the commit.

## Live run (criterion 2)

`npm run verify:knowledge` (default engine: Anthropic). It starts Vite's server in its own process, sends exactly one request, and closes the server before exiting. Output, 2026-10-03:

```
[llm] usage engine=anthropic model=claude-sonnet-5 input=2463 output=498
engine: anthropic, model: claude-sonnet-5, status: 200, last: done, elapsedMs: 4868
found: ["<type>/<item-id>-<short-slug>", "feat/b-06"]
pass: true
```

The reply, word for word (only blank lines between Markdown blocks normalized by Prettier):

> Great question—this one's actually well documented, so here's the breakdown:
>
> **Format:**
>
> ```
> <type>/<item-id>-<short-slug>
> ```
>
> **The parts:**
>
> 1. **`<type>`** — the Conventional Commits type that best matches the main change you're making:
>    - `feat` (new feature)
>    - `fix` (bug fix)
>    - `docs` (documentation)
>    - `refactor`
>    - `test`
>    - `chore`
>    - `build`
> 2. **`<item-id>`** — the backlog item ID, lowercase (e.g. `b-06`). If there's no backlog item for the work you're doing, you shouldn't create a branch yet — ask the PO (Ana) to add one first.
>
> 3. **`<short-slug>`** — two to four words, kebab-case, briefly describing the change.
>
> **Examples:**
>
> - `feat/b-06-knowledge-base`
> - `fix/b-13-cold-ollama-timeout`
> - `docs/b-07-citations-guide`
>
> **A few other habits that go with this:**
>
> - Always branch from an up-to-date `main`.
> - Keep branches short-lived — try to open the PR the same day.
> - Delete the branch once it's merged.
> - Never push directly to `main`.
>
> If you're ever unsure which `<type>` fits a mixed change (say, a fix that also includes some refactoring), that's a good one to ask your buddy — they'll know how the team leans in practice.

"The PO (Ana)" combines two documents correctly: `first-week.md` and `deploys.md` name Ana as the Product Owner.

The mock run of the same script (`npm run verify:knowledge -- --engine mock`) also passed, with both strings found.

## Not covered

- **No live Ollama run.** The contract names Anthropic for the live criterion. The 8,000-character budget is tested deterministically, but no run checked that phi3's real context holds the prompt untruncated.
- **No deployed run.** `included_files` and the `$LAMBDA_TASK_ROOT` fallback were checked under `netlify serve` (verify:prod:local), not on Netlify itself. The next `verify:prod` against the deployed site runs `knowledge-branch-naming` live.
