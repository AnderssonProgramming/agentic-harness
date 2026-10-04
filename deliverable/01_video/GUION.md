# Video script (5 minutes max)

A screen recording with your voice. No camera, no editing. Record at **125–150 % browser zoom**, with one clean window per segment and nothing else open.

## Before you record

- **Secrets:** don't open `.env`, the Netlify environment-variables page, the Anthropic console, or a terminal that has printed a key. Nothing in this script needs any of them.
- **Fresh state:** open https://agentichs.netlify.app in a **private/incognito window**, so the list and the conversation start empty.
- **Rate limit:** the walkthrough sends 5 messages, and the limit is 6 per 3 minutes. **Wait 3 minutes after any rehearsal** before the real take.
- Have these tabs ready, in order, in a second window:
  1. `docs/audit/COMPARISON.md` on GitHub
  2. `HARNESS.md`
  3. `docs/evidence/portability-test.md`
  4. `TASKS.md`
  5. the repository's commit history

## 0:00 – 0:40 · What I built, for whom, and the problem

> "This is **Compass**, an onboarding assistant for a junior developer in their first weeks at a small team: the person who has questions but is afraid to interrupt seniors with 'basic' ones. Compass answers in a chat and keeps an onboarding to-do list. More importantly, it was built entirely by an AI agent working inside an **AI harness**: written rules, skills, delegation contracts and an audit, so the agent works like a disciplined team and not like a fast intern."

_Screen: the live site, empty, with the URL visible._

## 0:40 – 1:40 · The product, the whole walkthrough, no cuts

Do the five steps from `ACCESO.md`, live, in one take:

1. Click **"What is our branch naming convention?"** → "It answers from the team's own documents, and cites the file."
2. Click the **`branch-naming.md`** chip → "The original document, in a side panel. The app checked that this file exists; the model can't invent a source."
3. _"How do we handle state management?"_ → "When the documents don't cover something, it says so, with no fake source."
4. _"Remind me to ask Ana how deploys work."_, _"What's on my list?"_, _"Mark the deploy one as done."_ → "Real actions on stored data. The confirmation comes from what was saved."
5. **Close the tab and reopen the URL** → "Everything is still there."

## 1:40 – 2:30 · The audit: before and after

_Screen: `docs/audit/COMPARISON.md`._

> "The harness doesn't only build; it evaluates. I wrote 25 audit criteria **before** the first audit ran. The audit skill always reports in the same validated format, so runs can be compared. Before: **4 High** findings (unbounded input to the model, a cost that could run away). After two rounds of delegated fixes: **0 High**. The 2 remaining Medium findings are written-down debt, with the condition that turns each into work. The first round of fixes passed every test the agent wrote, and the audit still found two bypasses. That's why every limit is now written as an invariant and proven with property tests."

## 2:30 – 3:40 · The harness, and the portability test

_Screen: `HARNESS.md`, scrolling through the three layers, then `docs/evidence/portability-test.md`._

> "Three layers:
>
> - **Context:** `CLAUDE.md` with the rules, and a settings file that _enforces_ them. The agent can't read `.env` or install packages without asking.
> - **Skills and delegation:** reusable skills and contracts for subagents.
> - **Verification:** check, verify scripts, the audit and a release gate. This app reached production through the `release` skill: it verifies a draft, asks me, then publishes exactly that draft.
>
> Then the portability test. A **fresh agent**, in an **empty folder**, with only `HARNESS.md`. The first three attempts stopped at three real gaps in the manual. I fixed each one, and the fourth installed the harness cleanly. Then a new session, given only 'Work on B-01', wrote a plan, asked me ten product questions instead of guessing, and built a working CLI with tests and evidence. Installed and first feature: about **10 minutes** of agent time."

## 3:40 – 4:20 · How much time the harness gives back, with numbers

_Screen: `TASKS.md`, "Before and after"._

> "Measured from git timestamps, not estimated:
>
> - **New screen:** the `new-route` skill saves about **20 minutes per screen**, and every screen arrives with the same layers, tests and a browser check.
> - **Connecting a model:** `llm-connect` saves about **18 minutes and 27 hand-written files** per project.
> - **Context:** reading indexes instead of whole files saved about **4,600 tokens per session**. Delegating in narrow passes cut a 232k-token pass down to **81k, for a quarter of the cost**.
> - **A new project:** harness installed and first feature built in about **10 minutes**.
>
> But the biggest saving isn't minutes. It's not redoing work that was wrong."

## 4:20 – 5:00 · What I didn't expect, and what's next

> "What I didn't expect: the dangerous mistakes weren't bugs, they were **quiet decisions**. The agent once chose to wipe unreadable data with no notice. Another time it trusted a prompt instead of the app. And a debugging flag printed an API key into a log, so I rotated it the same day. The harness got better each time, because every failure became a written rule with its cause.
>
> What's not finished: all 13 backlog items are done, but Compass ships with a sample team's documents; a real team swaps in its own. The release skill has had only a couple of production runs, not the three it needs to be officially listed. Two Medium findings, and two other small items, are written-down debt.
>
> Next 30 days: CI on every push, more releases until the release skill earns its listing, the debt with fired triggers, and this harness on a second real project."

## After recording

- Check that it's **5:00 or less**.
- Watch it once with the sound off, to check that the screen is readable and that no key, token or settings page appears in any frame.
- Upload it to `01_video/`, or put an unlisted YouTube link in `01_video/video.txt`.
