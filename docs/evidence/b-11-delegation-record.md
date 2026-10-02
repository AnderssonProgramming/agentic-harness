# B-11 delegation record: blind delegation to a subagent (Sprint 3, items 3.2 and 3.3)

**Rule of the test:** the PO may correct the contract, point out unmet criteria and ask for another pass, but never edits the code. **Result: no line of code was written by the PO or the orchestrating session.**

- 48 files changed in `src/`, `server/` and `scripts/`: +3,181 / −84 lines. All of it is in the subagent's 16 commits.
- The PO's commits in the same range touch only `docs/`, `BACKLOG.md` and `ARCHITECTURE.md`.

|          |                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Contract | [`docs/delegations/b-11-todo-list.md`](../delegations/b-11-todo-list.md): the original, plus Amendments 1 and 2            |
| Subagent | `.claude/agents/feature-builder.md`, run as `claude -p --agent feature-builder` in a fresh, bounded session for every pass |
| Evidence | [`b-11-verification.md`](b-11-verification.md), written by the subagent, plus the PO's independent runs below              |

## The three passes

| Pass | Trigger                                           | Commits | Time   | Cost     | Context peak | Outcome                                                                                                                            |
| ---- | ------------------------------------------------- | ------- | ------ | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | The original contract                             | 7       | 24 min | USD 5.65 | **199k**     | Every check green: 226 tests, `verify:todos` 12/12 mock and 8/8 live. **But the PO's live Ollama run found a false confirmation.** |
| 2    | Amendment 1: three behavioral corrections         | 5       | 26 min | USD 6.74 | **232k**     | All three met, with a live `phi3` run. The PO's independent run found **an intermittent check** (1 failure in 4 runs, under load). |
| 3    | Amendment 2: root cause of the intermittent check | 4       | 17 min | USD 1.46 | 81k          | Root cause in the check, not the app. Reproduced deterministically, fixed, 10/10 runs.                                             |

From the guide's table: **"meets after one or two contract corrections: normal and healthy"**. It took two corrections. Neither involved touching the code.

## What the original contract was missing

1. **A behavioral criterion that caught the real risk on every engine.** "With Ollama … never shows a false confirmation" was written down, but the contract let a _system prompt_ be the mitigation. Every automated check passed. Only a live run on the real local model showed `phi3` saying _"Okay, I've set a reminder for you"_ with nothing stored. **Lesson:** a criterion about an engine needs evidence _on that engine_, written into the contract. The contract asked for live Anthropic only.
2. **A rule for decisions about data loss and dropped actions.** The subagent decided that "unreadable to-do data resets with no notice" and "only the first action counts". Both silently lose something the user asked for. The contract said "no product decisions", but these looked technical. **Lesson:** list "anything that silently drops user data or a user request" as a product question in the contract's limits.
3. **A requirement that checks be reliable, not only green.** Pass 2 mentioned in passing "a second failing test I didn't identify; it passed on every rerun". The contract didn't say what to do with an intermittent failure, so it was treated as noise.
4. **Precision in the PO's own amendment.** Amendment 1 said known to-do phrases are "not performed" on engines without tools. The subagent applied that to "what's on my list?" as well, though the app could answer it from storage. The ambiguity was mine (now **B-12**).

## Decisions the subagent took that the PO wouldn't have

| Decision                                                                | The PO's call                                                                           | Where it ended up                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------- |
| Unreadable to-do data is reset **with no notice**                       | Overruled: say so once, like B-08                                                       | Amendment 1, item 2                      |
| **Only the first** action in a reply counts; later ones are ignored     | Overruled: run them all in order, one card each                                         | Amendment 1, item 3                      |
| Prompt instructions were enough to stop the model from claiming success | Overruled: capability-based refusal; the prompt isn't a control                         | Amendment 1, item 1; ADR-11 correction 1 |
| Refuse "what's on my list?" without tools                               | Kept for now, but it contradicts the feature's principle; it came from the PO's wording | B-12                                     |

Accepted as is: about 50 other decisions (pass reports listed roughly 30 + 19 + 7), e.g. tool names, card wording, matching rules, snapshot versions 2 and 3, the `GET /api/engine` route, the 1.5 s delay in the reproduction.

## What the subagent did well without being asked

- **Read-back confirmation:** after writing, it reads the list back from storage and builds the card from what's stored. A write that storage silently drops becomes a failure card.
- **Reported its own side effect:** `verify:chat` overwrote committed screenshots. It said so in pass 1, and in pass 2 removed them from a commit.
- **Recorded live wording honestly:** a live Claude run stored "Ask Ana how deploys work", not the mock's wording. The live check was loosened to look for "Ana" and "deploy", while the card must still match storage exactly.
- **Found a weakness nobody asked about:** two "notice is _not_ shown" checks can pass for the wrong reason, because an unknown engine also hides it. It left the app change to the PO.
- **Flagged a constraint it bent:** strictly, `start.actions` and `GET /api/engine` are a second protocol change beyond the one event allowed. Recorded in the ADR-11 review.

## The PO's independent verification (not the subagent's reports)

| Check                                                                    | Result                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `npm run -s check`, 5 consecutive runs                                   | 256/256 every time                                                                                            |
| `verify:todos` mock: 4 runs after pass 2                                 | **3 of 4 passed**: the intermittent failure that led to Amendment 2                                           |
| `verify:todos` mock: 3 runs after pass 3, **under concurrent test load** | 19/19 every time                                                                                              |
| `verify:todos -- --live` (Claude)                                        | 8/8 after pass 1                                                                                              |
| `verify:todos -- --live --engine=ollama` (`phi3`)                        | Notice and refusal: pass. The ordinary question **timed out cold** (`[llm] timeout`, B-13), then **4/4 warm** |
| `verify:chat`, `verify:persistence`, `verify:llm`                        | 19/19, 8/8, 10/10                                                                                             |

Storage was read from outside the page through Chrome's DevTools `DOMStorage` domain (`scripts/verify-todos.mjs`). That checks the data, not the text.

## Lessons for the harness

1. **Subagent context isn't bounded by itself.** Passes 1 and 2 ran their whole delegation in one reply and peaked at 199k and 232k tokens, because nobody was between turns to compact them. Pass 3, a narrow contract, stayed at 81k and cost a quarter as much. **Rule:** size each delegation so one pass fits the budget; split big features into amendments.
2. **"Rerun until green" isn't verification.** An intermittent failure is a finding: reproduce it, find the cause, fix it.
3. **A check that a thing is _absent_ must first wait for a state that proves it _could_ be present.**
4. **Every engine a criterion names gets a live run in the contract's evidence list.**
