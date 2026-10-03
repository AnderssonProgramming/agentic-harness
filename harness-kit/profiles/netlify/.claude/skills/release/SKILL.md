---
name: release
description: Releases the project to production on Netlify. It verifies the audit and the code first (and stops if anything is open), then generates release notes, bumps the version, deploys a draft, verifies the draft, publishes exactly that verified draft after the PO says go, verifies production, rolls back if it fails, and records what was deployed and when. Use when asked to "release", "deploy to production", "ship it", or "/release". Do NOT use to deploy a preview only (use npm run deploy:preview) or when the gate is failing.
argument-hint: '[major|minor|patch]  (default: minor)'
allowed-tools: Read, Grep, Glob, Write, Edit, Bash(npm run release:gate), Bash(npm run release:notes:*), Bash(npm version:*), Bash(npm run format), Bash(npm run -s check), Bash(npm run -s release:deploy:*), Bash(npm run verify:prod:*), Bash(git add:*), Bash(git commit:*), Bash(git tag:*), Bash(git status:*), Bash(git log:*), Bash(git push:*)
---

# release

## When to use it

To put the current `main` into production. This is the only path to production; `deploy:prod` exists for emergencies and is documented in the README.

## Inputs

- The bump: `major`, `minor` or `patch`. The default is `minor`. Ask only if the user's words are ambiguous.
- Preconditions the PO owns, checked in step 3:
  - the PO is logged in to Netlify (`npx netlify login`, run by the PO);
  - the folder is linked to a site (`npx netlify link` or `npx netlify init`, run by the PO);
  - the site has every variable in `harness.config.json` → `secretEnvVars` set in the Netlify UI;
  - any paid API the product calls has a spend limit set in its own console.

  You can't do any of these. Never handle or print a key.

## Steps

Plain commands from the repository root, one per call. **Stop at the first failure**, show the complete output, and don't continue.

1. **Gate.** Run `npm run release:gate`. If `mayRelease` is false, stop and report each failing check.
   - If `audit-covers-code` fails, the remedy is to run `/audit` and have the PO triage it. Don't run the audit yourself inside this skill.
   - Never edit `docs/audit/accepted-risks.md` to make the gate pass. Only the PO adds accepted risks.
2. **Version and notes:**
   - Run `npm version <bump> --no-git-tag-version`.
   - Read the new version from `package.json`.
   - Run `npm run release:notes -- v<version>` and write its output to `docs/releases/v<version>.md`.
   - Run `npm run format`, then `npm run -s check`.
   - Commit: `chore(release): v<version>`, listing the gate's commit in the body. Push it with `git push origin main`. The deploy must match GitHub.
3. **Production environment check.** Run `npm run -s release:deploy -- status`. It must show `loggedIn` and `linked` true; note `siteUrl`, and `publishedDeployId` as the rollback target (it may be null on the first release). The environment variables are checked by behaviour in step 5.
4. **Draft deploy.** Run `npm run -s release:deploy -- draft "v<version> draft"` and read `deployId` and `deployUrl` from the JSON. It builds first, using `netlify.toml`.
5. **Verify the draft.** Run `npm run verify:prod -- <deploy_url>`. If any check fails, **stop**: production is untouched. Report the failures and the draft URL.
6. **Ask the PO.** Report the draft's verify results and URL, and ask **"Publish v<version> to production?"**. Wait for an explicit yes. Publishing is outward-facing; never assume it.
7. **Publish exactly the verified draft:**
   - Re-run `npm run -s release:deploy -- status` and record `publishedDeployId` as the rollback target.
   - Then run `npm run -s release:deploy -- publish <draft deployId>`. It publishes the artifact that was verified, not a rebuild, and confirms the site now points at it.
8. **Verify production.** Run `npm run verify:prod -- <site url>`. **If it fails, roll back at once:** run `npm run -s release:deploy -- publish <rollback target>`, run `verify:prod` again on the restored site, and report both results. Never leave a failing version published. On the **first** release there is no rollback target (`publishedDeployId` was null). If production fails then, stop at once and tell the PO that the site is serving a failing first version, with the failing checks. The PO decides whether to take the site down in the Netlify UI.
9. **Record:**
   - Append a row to `docs/releases/DEPLOYMENTS.md`: version, date and time, commit, deploy id, draft URL, production URL, draft and production verify results, and the rollback target.
   - Append the same facts to `docs/releases/v<version>.md` under "## Deployment".
   - Commit `docs(release): record the v<version> deployment` and push.
   - Tag `v<version>` on the release commit, and run `git push origin v<version>`.
10. **Report:**
    - the production URL
    - the version
    - each verify check
    - the rollback target
    - anything the PO must still do (e.g. the spend limit, if it isn't confirmed)

## Output

- A production URL serving the verified version.
- `docs/releases/v<version>.md` (notes plus deployment facts), a row in `docs/releases/DEPLOYMENTS.md`, a `v<version>` tag, and the version bump in `package.json`. Everything is pushed.

## Verification

- [ ] `release:gate` passed **before** anything was built or deployed.
- [ ] The draft passed `verify:prod` **before** it was published.
- [ ] Production passed `verify:prod` after publishing, or was rolled back and verified.
- [ ] `DEPLOYMENTS.md` has the row, and the tag exists on GitHub.

## Known errors

| Symptom                                                       | Cause                                          | What to do                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The gate fails on `audit-covers-code`                         | Code changed after the last audit              | Stop. The PO runs `/audit` and triages, then retry                                                                 |
| The gate fails on `advisories-contained`                      | A new advisory outside the deploy-tool subtree | Stop. It's a new DEP-02 finding for the PO, not something to accept here                                           |
| `verify:prod` fails on a configuration check                  | A secret variable isn't set on the site        | Stop. Ask the PO to set it in the Netlify UI (Site configuration → Environment variables), then redeploy the draft |
| `release:deploy -- status` shows `loggedIn` or `linked` false | A one-time PO setup                            | Give the PO `npx netlify login` and `npx netlify link`; don't try to log in                                        |
| A long request fails at a fixed time                          | The platform's function duration limit         | Report the measured time. The PO decides: shorten the work per request, or change the plan                         |
