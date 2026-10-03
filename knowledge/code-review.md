# Code review

Every change reaches `main` through a pull request with at least one approval.

Before asking for a review:

1. `npm run format`, then `npm run check`. A pull request with a failing check isn't ready.
2. The description names the backlog item, lists each acceptance criterion, and links the evidence for it (a test, or a `verify:*` script output).
3. Commits follow Conventional Commits, one logical change each.

As a reviewer, check behavior before style: does each criterion have evidence, and is anything the user loses or is told decided quietly? Ask instead of guessing.

It's normal for a junior to ask "is this a good question?" in a review thread. The answer is always yes. Reviews are how the team shares context, not a test.

Expect a first review within one working day. If you're blocked longer, mention the reviewer in the team channel; that's not interrupting.
