---
name: audit
description: Runs the project's security and performance audit against AUDIT-CRITERIA.md and writes a risk-classified report in a fixed format, so two runs can be compared. Use before every deployment, after fixing findings, or when asked to "run the audit" or "/audit". Do NOT use to fix findings (that's a delegation per finding), or for an open-ended "review my code".
argument-hint: (no arguments)
allowed-tools: Read, Grep, Glob, Write, Bash(npm run format), Bash(npm run audit:facts), Bash(npm run audit:validate:*), Bash(npm run verify:chat:*), Bash(npm run verify:persistence:*), Bash(npm run verify:todos), Bash(npm run verify:llm), Bash(git rev-parse:*), Bash(git log:*), Bash(git show:*)
---

# audit

## When to use it

Before a deployment, and after fixes, to prove they hold. The report is evidence, so it must be **reproducible**: same criteria, same methods, same format, every run.

## Inputs

None. Everything comes from `AUDIT-CRITERIA.md`, the code, and the commands below.

## Risk classification (use exactly this)

| Risk         | Definition                                                  |
| ------------ | ----------------------------------------------------------- |
| **Critical** | Compromises data or credentials, or leaves the app unusable |
| **High**     | Likely failure in real use, or a cost that can run away     |
| **Medium**   | Annoys or degrades, but doesn't break                       |
| **Low**      | Cosmetic, or a future improvement                           |

Each criterion has a default **"Risk if failed"**. **Always report that default risk in the Risk column.** Reclassifying is the PO's decision, made in a separate triage after the run, not the auditor's. If the evidence suggests another risk, write "Suggested risk: X, because …" at the end of the Evidence cell. (Runs A and B on the same commit disagreed on LLM-02's risk when the auditor was allowed to reclassify, so the counts weren't comparable.)

## Steps

Run every command from the repository root in its plain form: one per call, no chaining.

1. Read `AUDIT-CRITERIA.md` in full: it's the only list of checks. From `ARCHITECTURE.md`, read only the _Decision index_.
2. Run `npm run audit:facts`. Its JSON is the evidence for SEC-01 to SEC-04, PERF-03 and DEP-01 to DEP-03. Judge each secret hit: a key-shaped string that's deliberately fake (a test fixture, an "invalid key" check) isn't a leak, but say why, citing the line.
3. Run the browser and endpoint checks the criteria cite, in the foreground:
   - `npm run verify:llm`
   - `npm run verify:todos`
   - `npm run verify:persistence -- <a temp folder>`
   - `npm run verify:chat -- <a temp folder>`

   Pass a temp folder for screenshots, so committed evidence doesn't change. Record pass counts only; don't paste the outputs.

4. Go through the criteria **in order, one by one**, using each criterion's "How to check". For code-reading checks, `Grep` first, then `Read` only the lines you need. Cite **file:line** for every claim.
5. **Don't add criteria.** Anything you notice outside the list goes under "Observations outside the criteria", never in Findings, and never changes the counts.
6. Write the report to `AUDIT-REPORT.md` in exactly the format below. Also save a copy to `docs/audit/<YYYY-MM-DD>-<short commit>.md`, so later runs can be compared.
7. Run `npm run format`, so the report's tables are formatted. An unformatted report fails `npm run check` for everyone. The baseline of 2026-10-02 was committed unformatted and broke `check` at `HEAD`.
8. Run `npm run audit:validate`. If it reports problems, fix the **report** (never the code) and rerun until it's valid.
9. Report back: the counts by risk, each Critical and High finding in one line, and the validation result. **Don't fix anything and don't commit.** Fixing is the PO's decision, through a separate delegation per finding.

## Output: report format (fixed)

```markdown
# Audit report

- Date: YYYY-MM-DD
- Commit: <short hash>
- Criteria: AUDIT-CRITERIA.md (25 checks)
- Checks run: audit:facts, verify:llm N/N, verify:todos N/N, verify:persistence N/N, verify:chat N/N

## Criteria

| ID                                           | Result | Evidence                         |
| -------------------------------------------- | ------ | -------------------------------- |
| SEC-01                                       | met    | file:line or facts key, one line |
| ... every criterion, in the file's order ... |

## Findings

| ID   | Criterion | File                     | Risk | Evidence                  | Proposed fix                                         |
| ---- | --------- | ------------------------ | ---- | ------------------------- | ---------------------------------------------------- |
| F-01 | IN-02     | server/llm/history.ts:12 | High | what was seen, concretely | the smallest change that would satisfy the criterion |

## Counts by risk

| Risk     | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 0     |
| Low      | 0     |

## Observations outside the criteria

- (optional; not counted)
```

Rules for the format:

- **Exactly one finding per failed criterion.** Put the most representative `file:line` in the File column, and list every other location in the Evidence cell. (Splitting by location made the counts drift between runs.)
- A failed criterion with no finding, or a finding without `file:line`, makes the report invalid.
- IDs are `F-01`, `F-02`, … in the order of the criteria.

## Verification

- [ ] `npm run audit:validate` exits 0: all 25 criteria appear exactly once; every finding has `file:line` and a valid risk; the counts match the table.
- [ ] Every Critical and High finding cites code you actually read, not a guess.
- [ ] No source file changed: run `git status` and check that only `AUDIT-REPORT.md` and `docs/audit/` are new or modified.

## Known errors

| Symptom                                              | Cause                                                               | What to do                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Each run finds different things                      | Criteria were improvised                                            | Reread step 5. Only `AUDIT-CRITERIA.md` counts                                                 |
| A dozen findings come from one criterion             | The criterion is badly written, or one cause appears in many places | Report one finding per distinct location, and raise the criterion's wording under Observations |
| `verify:*` overwrote screenshots in `docs/evidence/` | It was run without a temp folder                                    | Restore them with `git restore docs/evidence`, and pass a temp folder                          |
