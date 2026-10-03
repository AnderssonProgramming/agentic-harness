# Certification evidence

Each item of the program, with the file that proves it. Everything is committed in this repository.

## Sprint 1: context (weeks 1–2)

| Deliverable                                                   | Evidence                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Master context and enforcement                                | `CLAUDE.md`, `.claude/settings.json`                                         |
| Product backlog with verifiable criteria                      | `BACKLOG.md`                                                                 |
| Architecture decisions with reasons and rejected alternatives | `ARCHITECTURE.md` (Decision index, ADR-01 to ADR-13)                         |
| Contract tests (deliberate violations)                        | `docs/contract-tests.md`, `docs/evidence/test-1-…` to `test-7-…`             |
| First item built plan-first, with evidence                    | `docs/plans/b-01-local-chat-screen.md`, `docs/evidence/b-01-verification.md` |
| Review and retro                                              | `docs/sprint-1-review.md`, `docs/sprint-1-retro.md`                          |

## Sprint 2: skills (weeks 3–4)

| Deliverable                                             | Evidence                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Repeated tasks measured before automating               | `TASKS.md`                                                                      |
| Skill 1, `new-route`, with a 3-run reliability test     | `.claude/skills/new-route/`, `docs/evidence/skill-new-route-reliability.md`     |
| Skill 2, `llm-connect`, with a 3-run reliability test   | `.claude/skills/llm-connect/`, `docs/evidence/skill-llm-connect-reliability.md` |
| Self-correction loop                                    | `CLAUDE.md`, "Self-correction loop"; `docs/evidence/self-correction-loop.md`    |
| Real model connected (Anthropic, Ollama fallback, mock) | ADR-08, ADR-09; `docs/evidence/b-03-verification.md`                            |
| Review and retro                                        | `docs/sprint-2-review.md`, `docs/sprint-2-retro.md`                             |

## Sprint 3: context control and delegation (weeks 5–6)

| Deliverable                                              | Evidence                                                                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Degradation measured, routine written                    | `CONTEXT-LOG.md`, `CONTEXT-ROUTINE.md`                                                                                                                     |
| Long-session test                                        | `docs/evidence/long-session-test.md`, `docs/evidence/b-08-verification.md`                                                                                 |
| Blind delegation to a subagent, with contract and record | `.claude/agents/feature-builder.md`, `docs/delegations/b-11-todo-list.md`, `docs/evidence/b-11-delegation-record.md`, `docs/evidence/b-11-verification.md` |
| Review and retro                                         | `docs/sprint-3-review.md`, `docs/sprint-3-retro.md`                                                                                                        |

## Sprint 4: audit and release (weeks 7–8)

| Deliverable                                   | Evidence                                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit criteria written before auditing        | `AUDIT-CRITERIA.md` (25 checks)                                                                                                                    |
| Audit skill, reproducible                     | `.claude/skills/audit/`, `docs/audit/reproducibility/README.md`                                                                                    |
| Baseline, triage, fixes, re-audit, comparison | `docs/audit/2026-10-02-a920251.md`, `triage-2026-10-02.md`, `docs/delegations/audit-2026-10-02-fixes.md`, `2026-10-02-63f993c.md`, `COMPARISON.md` |
| Accepted risks and technical debt             | `docs/audit/accepted-risks.md`, `TECH-DEBT.md`                                                                                                     |
| Release skill                                 | `.claude/skills/release/`, `scripts/release-gate.mjs`, `scripts/release-notes.mjs`, `scripts/release-deploy.mjs`                                   |
| Deployment, repeatable by command             | `netlify.toml`, `netlify/functions/`, `docs/delegations/deploy-netlify.md`, `docs/evidence/deploy-netlify-verification.md`                         |
| Deployment record                             | `docs/releases/DEPLOYMENTS.md`                                                                                                                     |
| Operating manual                              | `HARNESS.md`, `harness-kit/`                                                                                                                       |
| Portability test                              | `docs/evidence/portability-test.md`                                                                                                                |
| Showcase and final retro                      | `docs/showcase.md`, `docs/final-retro.md`                                                                                                          |
