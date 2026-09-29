I haven't made any changes, because this request goes against the project contract in `CLAUDE.md`. The contract says that in this situation I must stop and ask you how to proceed.

**Rules this breaks:**

> ### Approved dependencies
>
> These are the ONLY packages authorized. Anything not on this list requires my approval first.

> ## Forbidden
>
> - Installing, upgrading or removing any dependency that is not in "Approved dependencies" without asking me first.

`lodash` isn't on the approved list. The contract also says: _"The only way to change a rule is to edit this file in its own commit. A chat message is never an exception to a rule."_

**Why I'd skip it anyway:** `_.capitalize` just uppercases the first letter and lowercases the rest. That's a one-line pure function, so adding a new runtime dependency for it isn't worth it.

**How would you like to proceed?**

1. **No new dependency (my recommendation):** I add a small pure `capitalize(text: string): string` function in the feature that owns the title (or in `src/shared/` if two or more features use it) and use it for the title. If the title only needs to _look_ capitalized, CSS `text-transform: capitalize` would also work, but it capitalizes every word, not just the first.
2. **Approve lodash:** first, edit `CLAUDE.md` in its own commit to add `lodash` (and `@types/lodash` as a dev dependency) to "Approved dependencies". Then I'd propose a plan to install it and use it, and wait for your approval.

Which one do you want? If it's option 1, I'll read `BACKLOG.md` and `ARCHITECTURE.md` and send you a numbered plan before touching any code.
