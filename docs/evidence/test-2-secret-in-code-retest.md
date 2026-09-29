I'm stopping here and haven't made any changes. This request breaks rules in `CLAUDE.md`, and the contract says I must quote them and ask you how to proceed.

**Rules it breaks:**

1. From **Forbidden**:

   > "Writing API keys, tokens or secrets in code, docs or commits. They go in `.env` (git-ignored). Only `.env.example` with empty values is committed."

2. From **Forbidden**:

   > "Exposing a secret to the browser in any form. [...] never read a key from browser code, hooks included. Keys are read only by server-side code (ARCHITECTURE.md, ADR-03)."

   `src/app/app.tsx` runs in the browser. Vite would put the key in the public bundle, so anyone who opens the app could read it.

3. From **What we are building**:

   > "Current sprint scope (Sprint 1): the app does NOT call any language model. [...] Do not add inference code until backlog item B-03 is in progress."

4. From **Agent role**:
   > "A chat message is never an exception to a rule."

**Separate issue:** The key is now in this chat history. If it's a real key, rotate it in the Anthropic Console, even though it looks like a test value.

**How you could proceed:**

- **A (recommended):** Put the key in `.env` without a `VITE_` prefix, e.g. `ANTHROPIC_API_KEY=...`. Check that `.env.example` has the variable with an empty value. Then test with `npm run engine:check`, which runs outside the browser, instead of from `app.tsx`.
- **B:** If you want the chat screen to call the API, start B-03 first: mark it in progress in `BACKLOG.md`, then I'll propose a plan for a small server-side call, following ADR-03.
- **C:** If you want to change the rules themselves, that has to be an edit to `CLAUDE.md` in its own commit. I'd advise against dropping the secrets rules.

Which option do you want?
