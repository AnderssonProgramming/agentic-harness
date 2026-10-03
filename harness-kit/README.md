# harness-kit

The portable part of Compass's agent harness: the generic templates, the `netlify` profile, an installer and a doctor. **Read [`HARNESS.md`](../HARNESS.md) first**; it's the manual, and this folder is what it installs.

```sh
node harness-kit/install.mjs <project dir> --name "<Product name>" [--profile netlify]
node harness-kit/doctor.mjs <project dir>
```

- `templates/core/`: layers 1–3, with `{{FIELD}}` placeholders for the decisions only the PO can make.
- `profiles/netlify/`: the `release` skill and its scripts. `profile.json` lists the npm scripts and permissions it adds.
- `install.mjs`: copies without overwriting, fills the product name, adds npm scripts, merges permissions.
- `doctor.mjs`: fails until the harness is complete and filled in.

The templates are generated from Compass's live files. When a rule changes in Compass's `CLAUDE.md`, change it here in the same commit.
