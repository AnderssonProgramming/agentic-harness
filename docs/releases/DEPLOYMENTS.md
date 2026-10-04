# Deployments

One row per production release, appended by the `release` skill.

| Version | Date (UTC)       | Commit    | Deploy id                  | Draft URL                                               | Production URL                | Draft verify | Production verify | Rollback target                     |
| ------- | ---------------- | --------- | -------------------------- | ------------------------------------------------------- | ----------------------------- | ------------ | ----------------- | ----------------------------------- |
| v0.2.0  | 2026-10-03 20:05 | `1398949` | `6ac15f7eb6ec63b6919f813d` | https://6ac15f7eb6ec63b6919f813d--agentichs.netlify.app | https://agentichs.netlify.app | 6/6          | 6/6               | none (first release)                |
| v0.3.0  | 2026-10-04 01:19 | `3259822` | `6ac1a576e4bf1680b3470afd` | https://6ac1a576e4bf1680b3470afd--agentichs.netlify.app | https://agentichs.netlify.app | 8/8          | 8/8               | `6ac15f7eb6ec63b6919f813d` (v0.2.0) |
