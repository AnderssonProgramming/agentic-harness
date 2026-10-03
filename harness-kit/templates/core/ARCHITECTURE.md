# Architecture

The memory of why the project is built the way it is. Each entry records the decision, the reason, and the alternative that was rejected. Sessions read the **Decision index** first, then only the ADRs their task touches (CONTEXT-ROUTINE.md, step 3).

## Decision index

| ADR                              | Decision              | Status | Touches  |
| -------------------------------- | --------------------- | ------ | -------- |
| [ADR-01](#adr-01-decision-title) | {{ONE_LINE_DECISION}} | Active | {{AREA}} |

New ADRs add a row here in the same commit.

## Folder structure

```
{{TREE_OF_THE_PROJECT_WITH_ONE_COMMENT_PER_FOLDER}}
```

## [ADR-01] {{DECISION_TITLE}}

Date: {{YYYY-MM-DD}}

Decision: {{WHAT_WAS_DECIDED}}

Reason: {{WHY, IN TERMS OF THE PRODUCT AND OF MAINTAINING IT}}

Rejected alternative: {{WHAT ELSE WAS CONSIDERED, AND WHY IT LOST}}

<!-- For a decision proposed by an agent and reviewed by the PO, add:
Agent's proposal: … / Decision: accepted | corrected | rejected / Reason: … / Rejected alternative: … -->
