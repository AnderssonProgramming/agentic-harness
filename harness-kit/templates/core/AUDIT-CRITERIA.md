# Audit criteria

The checklist the `audit` skill runs against. **Write it before running any audit**, from the product's promises (backlog criteria, ADRs), not from reading the code. Keep only the checks that apply to this product (Compass has 25; a small CLI may need 10). Each one has a fixed method and a default risk, so two runs can be compared.

Rules for the auditor:

- every criterion appears in every report, as met or failed;
- **don't add criteria** (extras go under "Observations");
- use the "How to check" method;
- always report the default risk; reclassifying is the PO's triage.

`npm run audit:facts` provides the facts a script can establish.

Criterion IDs must look like `ABC-01` (capital letters, a dash, two digits), e.g. `CALC-01`. `audit:validate` recognises only that shape.

## Secrets (SEC)

| ID     | Check                                                                                                   | How to check                                                                                      | Risk if failed |
| ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| SEC-01 | No API keys, tokens or private keys in tracked files                                                    | `audit:facts` → `secrets.tracked`; judge each hit (a fake test fixture isn't a leak, but say why) | Critical       |
| SEC-02 | No real key anywhere in the git history                                                                 | `audit:facts` → `secrets.history`                                                                 | Critical       |
| SEC-03 | The client-side build contains no key names or values                                                   | `audit:facts` → `bundle.secrets`                                                                  | Critical       |
| SEC-04 | `.env` is ignored and was never committed; `.env.example` lists every variable with empty secret values | `audit:facts` → `env`                                                                             | High           |

## User input (IN)

| ID    | Check                                                                                                      | How to check                                      | Risk if failed |
| ----- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------- |
| IN-01 | Every endpoint validates its input and answers malformed input with an error, without crashing             | {{WHERE_INPUT_IS_PARSED}}                         | High           |
| IN-02 | Input size is bounded **on the server** as an invariant (whatever the request's shape), not only in the UI | {{WHERE_LIMITS_LIVE}}, plus a property-style test | High           |

## Errors (ERR)

| ID     | Check                                                                                        | How to check                                                          | Risk if failed |
| ------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------- |
| ERR-01 | No failure shows internal details to the user                                                | {{WHAT_THE_UI_RENDERS_ON_ERROR}}                                      | High           |
| ERR-02 | No failure leaves the app unusable, including **sequences** of failures and growth over time | {{VERIFY_SCRIPTS}}, plus a property-style test over request sequences | High           |

## {{PRODUCT_SPECIFIC_AREA, e.g. "Model consumption (LLM)"}}

| ID          | Check     | How to check | Risk if failed |
| ----------- | --------- | ------------ | -------------- |
| {{AREA-01}} | {{CHECK}} | {{METHOD}}   | {{RISK}}       |

## Persistence (PER), Performance (PERF), Dependencies (DEP)

| ID      | Check                                                                                  | How to check                         | Risk if failed |
| ------- | -------------------------------------------------------------------------------------- | ------------------------------------ | -------------- |
| PER-01  | Stored data has a size limit or pruning                                                | {{STORES}}                           | Medium         |
| PERF-01 | {{THE_MAIN_HOT_PATH}} doesn't redo work it can avoid                                   | {{METHOD}}                           | Medium         |
| PERF-02 | The client build is under {{BUDGET}} gzipped                                           | `audit:facts` → `bundle.jsGzipBytes` | Medium         |
| DEP-01  | Every declared dependency is used                                                      | `audit:facts` → `deps.unused`        | Low            |
| DEP-02  | No high or critical advisory, except causes accepted in `docs/audit/accepted-risks.md` | `audit:facts` → `deps.audit`         | High           |
| DEP-03  | Every runtime dependency has a permissive license                                      | `audit:facts` → `deps.licenses`      | Medium         |
