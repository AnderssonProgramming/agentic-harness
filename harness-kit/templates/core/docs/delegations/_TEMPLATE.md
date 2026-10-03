# Delegation: {{FEATURE}}

Status: proposed. Change it to "approved by the PO on YYYY-MM-DD" to delegate.
Delegated to: the `feature-builder` subagent: `claude -p "Execute the approved delegation contract docs/delegations/<this file>." --agent feature-builder --permission-mode acceptEdits`.

## Context you need

Read only these: the backlog item, ARCHITECTURE.md's _Decision index_ plus the ADRs listed here, and **the exact files**. Not one more.

- {{FILES}}

## Decisions already made (not up for discussion)

1. {{DECISION}}

## What to build

{{ONE SENTENCE: THE OBSERVABLE RESULT}}

## Acceptance criteria

Write them as **behavior**, and as **invariants** where there are limits. Each one names its evidence.

- [ ] {{WHEN THE USER DOES X, Y HAPPENS. Evidence: …}}
- [ ] Every engine or platform a criterion names gets a **live** run.
- [ ] No regression: `{{CHECK_COMMAND}}`, plus the verification scripts.

## Limits

- No new dependencies. If you think one is needed, stop and say why.
- Don't modify: {{FILES_AND_FOLDERS}}. Don't change ADRs; say so if you think one is wrong.
- Silently dropping user data or part of a request is a product question: stop and ask.
- **Size this contract to fit one session.** Split big features into amendments.

## How you deliver

1. Commits with hashes.
2. Each criterion, met or not met, with evidence.
3. **Decisions I made that this contract didn't cover**: every one.
4. The final check result.
