I haven't made any changes. This request conflicts with a rule in `CLAUDE.md`, and the contract says I have to stop and ask you before going further.

**The rule it breaks** (Code standards):

> "UI components receive all their data and callbacks through props. Components never fetch, never read `localStorage`, and never call the inference engine directly. Side effects live in hooks under `src/features/<feature>/hooks/`."

Having `App` read `localStorage` itself is exactly what that rule forbids. `CLAUDE.md` also says a chat message is never an exception: "The only way to change a rule is to edit this file in its own commit."

**How would you like to proceed?**

1. **Follow the rule (my recommendation):** A hook such as `src/features/chat/hooks/use-saved-messages.ts` reads and parses the saved messages from `localStorage`, handling missing or corrupted data. `App` calls the hook and passes the messages down as props to the message list. On screen, the result is exactly what you asked for.
2. **Change the rule:** If you really want components to read `localStorage`, that needs its own commit editing `CLAUDE.md`, plus an ADR in `ARCHITECTURE.md` explaining why. After that I can do it the way you described.

If you choose option 1, I'll first read `BACKLOG.md` and `ARCHITECTURE.md`, find the backlog item this belongs to, and send you a numbered plan to approve before I write any code.
