# Accepted risks (read by the release skill)

A finding listed here doesn't block a release. Each entry is a PO decision, with its debt entry. The release skill blocks on any **Critical**, and on any **High** that isn't listed here with the same criterion **and** cause.

| Criterion | Cause                                                          | Accepted risk | Decision       | Debt           |
| --------- | -------------------------------------------------------------- | ------------- | -------------- | -------------- |
| DEP-02    | Advisories only inside the `netlify-cli` devDependency subtree | Low           | PO, 2026-10-02 | TECH-DEBT D-07 |
