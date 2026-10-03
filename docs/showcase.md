# Showcase: 5 minutes

**The claim:** the agent built Compass, but the harness is what made it trustworthy. And the harness now fits in a folder you can install anywhere.

Everything below is live or a committed file. No slides.

## 0:00 – 0:45 · The product

- Open Compass (production URL in `docs/releases/DEPLOYMENTS.md`, or `npm run dev` locally).
- Ask: _"Where do API calls live in this codebase?"_ The reply streams in.
- Say: _"Remind me to read the ADRs."_ The to-do appears in the list, from storage. The model can't claim an action the app didn't take (B-11).
- Reload: the conversation and the list are still there (B-08).

## 0:45 – 1:45 · Layer 1: what the agent knows and may touch

- `CLAUDE.md`: plan first, evidence before `done`, the Forbidden list. Every rule has its cause next to it.
- `.claude/settings.json`: `.env` and `node_modules/` are denied. **The explanation stops it from trying, the denial stops it when it tries anyway.** In contract test 7 the agent refused to open `node_modules/`; in Sprint 1 the denial caught a real attempt.
- `CONTEXT-ROUTINE.md`: read the ADR index, not the file. That saved 3,200 + 1,400 tokens per session (`CONTEXT-LOG.md`, "The pattern").

## 1:45 – 3:00 · Layer 2: repeatable work and delegation

- `/audit`, live or from `docs/audit/`: 25 fixed criteria, default risks, a validator. **High findings went 4 → 2 → 0** (`docs/audit/COMPARISON.md`).
- A delegation contract (`docs/delegations/deploy-netlify.md`) and its three passes.
- The moment to show: **"Decisions I made that this contract didn't cover."** In week 8 that list included _"the real key was printed to a local log."_ The fix wasn't a hand patch but Amendment 2: `serve:prod` structurally can't hold a secret. Run `npm run verify:prod:local`: `"engine": "mock"`, no secrets injected, ports closed afterwards.

## 3:00 – 4:00 · Layer 3: proof, and the release

- `npm run release:gate`: nine checks, from "audit covers the code" to "advisories only inside accepted packages". Each one passes on this commit.
- `/release`: draft → `verify:prod` on the draft → **asks the PO** → publishes that exact draft → `verify:prod` on production → a row in `docs/releases/DEPLOYMENTS.md`.

## 4:00 – 4:45 · Portability

- `HARNESS.md` plus `harness-kit/`: `install.mjs`, then `doctor.mjs` until it says **Harness OK**.
- Day 9's test: fresh agents in an empty folder, with only the manual. Three stopped at three different gaps (all fixed); the fourth installed it, and a new session then built a working CLI, plan-first, with evidence (`docs/evidence/portability-test.md`).

## 4:45 – 5:00 · Close

> The agent decides **how**. Whenever a choice changes what the user loses, sees or is told, it stops and asks. The harness makes that boundary enforceable, checkable and portable.

Final retro: `docs/final-retro.md`. Certification evidence: `docs/certification.md`.
