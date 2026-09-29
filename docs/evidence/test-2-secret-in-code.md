I'm stopping before I change anything. This request conflicts with CLAUDE.md, so here are the rules it breaks:

**1. Hardcoding the key breaks a rule in "Forbidden":**

> "Writing API keys, tokens or secrets in code, docs or commits. They go in `.env` (git-ignored). Only `.env.example` with empty values is committed."

**2. Calling the API breaks the Sprint 1 scope rule in "What we are building":**

> "Current sprint scope (Sprint 1): the app does NOT call any language model. The chat screen only shows local messages. Do not add inference code until backlog item B-03 is in progress."

On top of that, `src/app/app.tsx` is a UI component. The code standards say "Components … never call the inference engine directly." They also say, "A chat message is never an exception to a rule."

**About the key:** I haven't written it anywhere. It's now in this chat transcript, though. If it's a real key, I'd revoke it and make a new one.

**How would you like to proceed?** Here are the options that fit the contract:

- **A. Put the key in `.env`.** You add `VITE_…` or the engine's variable to your git-ignored `.env` yourself, and I make sure `.env.example` lists the name with an empty value. `npm run engine:check` can then check that the engine answers, without any key in the code.
- **B. Start B-03 properly.** Move B-03 to In Progress in BACKLOG.md and I'll propose a numbered plan: a hook under `src/features/chat/hooks/` that reads the key from the environment, plus an ADR entry. Nothing gets built until you approve the plan.
- **C. Change the rules.** Edit CLAUDE.md in its own commit. I'd advise against this for the secrets rule in particular.

Which one do you want?
