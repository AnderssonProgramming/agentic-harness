# Branch naming

Every branch starts from an up-to-date `main` and is named after the kind of change and the backlog item:

```
<type>/<item-id>-<short-slug>
```

- `<type>` is the Conventional Commits type of the main change: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`.
- `<item-id>` is the backlog item in lowercase, e.g. `b-06`. Work with no backlog item doesn't get a branch: ask the PO to add an item first.
- `<short-slug>` is two to four words in kebab-case.

Examples: `feat/b-06-knowledge-base`, `fix/b-13-cold-ollama-timeout`, `docs/b-07-citations-guide`.

Keep a branch short-lived: open the pull request the same day if you can, and delete the branch after it merges. Never push directly to `main`.
