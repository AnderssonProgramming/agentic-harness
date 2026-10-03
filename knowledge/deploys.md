# How deploys work

Production is deployed only through the `release` skill (`/release` in Claude Code). Nobody deploys by hand.

What the release does, in order:

1. **Gate:** clean `main`, pushed, covered by the latest audit, no Critical findings, every High accepted by the PO, and `npm run check` passing.
2. **Version and notes:** bumps the version and writes the release notes from the commits.
3. **Draft:** deploys a draft that isn't public yet, and runs `verify:prod` against it.
4. **The PO decides:** the release asks "Publish to production?" and waits for an explicit yes.
5. **Publish:** puts exactly the verified draft live, without rebuilding it. Then it checks production, and rolls back automatically if production fails.
6. **Record:** adds a row to `docs/releases/DEPLOYMENTS.md` and tags the version.

Juniors don't run releases in their first month, but you should read one release's notes and its row in `DEPLOYMENTS.md` during your first week. Ask Ana (the PO) if anything in them is unclear: that's exactly the kind of question she wants.
