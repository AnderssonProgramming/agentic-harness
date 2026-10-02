# Audit reproducibility test (2026-10-02)

The audit skill ran **twice on the same commit** (`f35e3e1`), each time in a fresh session. The first report was moved aside before the second run started.

|                                | Run A                                                 | Run B          |
| ------------------------------ | ----------------------------------------------------- | -------------- |
| Failed criteria                | IN-02, IN-03, LLM-02, LLM-05, LLM-06, PER-01, PERF-01 | **the same 7** |
| Findings                       | 9                                                     | 8              |
| Critical / High / Medium / Low | 0 / 3 / 5 / 1                                         | 0 / 4 / 4 / 0  |
| `audit:validate`               | valid                                                 | valid          |

**What was stable:** which criteria fail, and the code each finding points to.

**What drifted:**

1. **The risk of the same finding.** The auditor reclassified LLM-02 (the Ollama output cap) as Medium in run A and kept the default High in run B.
2. **The number of findings per criterion.** LLM-06 and PER-01 were split by location in run A but not in run B.
3. **Line numbers** for the same problem (`history.ts:62` vs `:30`).

**The fix:** the skill now always reports the default risk; reclassification is the PO's job in a separate triage, and the auditor only writes "Suggested risk: …". It also reports exactly one finding per failed criterion, with the other locations in the Evidence cell. `audit:validate` rejects a second finding for the same criterion, and run A would now fail validation. Line numbers within a finding can still differ, so the comparison unit is the criterion, not the line.
