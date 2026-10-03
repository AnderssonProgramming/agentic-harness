# Session degradation log

Measure where sessions degrade before writing rules about it. For headless sessions, `npm run context:profile -- run.jsonl` prints context tokens per call and what filled the context.

## Session 1

- **Task:** {{WHAT}}
- **Size:** {{turns, minutes, context first → max tokens}}
- **What it loaded:** {{the largest tool results}}
- **When it started failing:** {{after which action}}
- **Symptom:** {{repeated a corrected error / proposed something rejected / contradicted a rule / remembered wrongly}}
- **What I did:** {{new session / compact / rule}}
