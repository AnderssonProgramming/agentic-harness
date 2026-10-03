# Technical debt

What we decided **not** to fix yet, and why. Debt that's written down is a decision; debt nobody wrote down is a problem. Every entry names the condition that turns it into work.

## [D-01] The stored conversation is never pruned (audit F-06, PER-01)

- **Risk:** Medium
- **Where:** `src/features/chat/model/conversation-snapshot.ts:51`. `toSnapshot` serializes every message on each save, so storage only grows.
- **Why not now:**
  - When storage fills, the app already behaves correctly: the chat keeps working in memory and the user sees the "won't be saved" notice (B-08, `verify:persistence` "full storage").
  - The browser's limit (about 5 MB) holds thousands of messages, and nobody is near that today.
  - **Which** messages to drop (the oldest? keep to-do cards?) is a product decision. It deserves its own backlog item, not a rushed fix.
- **When to fix:** before B-06 (the knowledge base makes replies longer), or as soon as any real conversation passes about 500 messages, whichever comes first.

## [D-02] Message list items re-render on every streamed chunk (audit F-07, PERF-01)

- **Risk:** Medium
- **Where:** `src/features/chat/components/message-list.tsx:33`. Items aren't memoized, so every chunk re-renders every `<li>`.
- **Why not now:** measured, not guessed. `verify:chat` puts a send with 50 messages at **8–12 ms**, against a 100 ms target. The cost is real but invisible at today's sizes, and the fix (`memo` keyed on message identity) has to be checked against the streaming reply's own updates, so it isn't free.
- **When to fix:** when `verify:chat`'s 50-message measurement passes 50 ms on the reference machine, or when conversations commonly pass about 200 messages (see D-01).

## [D-03] Provider error bodies reach the browser and storage (observation outside the audit criteria)

- **Risk:** Low
- **Where:** `server/llm/handler.ts`, the `error` event's `message`. For example `anthropic HTTP 401: {"type":"error",…}` reaches the client, and `failReply` keeps it in the stored conversation. The UI shows only `describeChatError`, so nothing leaks on screen (ERR-01 is met).
- **Why not now:** no keys or user content are in those bodies (`verify:llm` scans for keys), and it's visible only in DevTools on the user's own machine. Fixing it means changing what the protocol carries (ADR-09).
- **When to fix:** when the app is exposed to users other than its owner (after week 8's deployment). At that point, add **ERR-04** to AUDIT-CRITERIA.md: "Provider error details never leave the server; the browser receives only the code and engine."
- **2026-10-02, at deployment: re-deferred by the PO.** The trigger fired (the app is going public), and the PO chose to ship without fixing it. The deployment subagent and the PO session both raised it. It stays Low: the bodies hold no keys or user content, and they're visible only in the user's own DevTools and storage. **New trigger:** the next audit cycle, or any report of a provider body exposing something sensitive.
- **2026-10-03, first production release:** seen live. A production `config` error tells the user to "Set it in .env (without a VITE_ prefix)", developer advice that's wrong and confusing in production. Fold it into the same fix (ERR-04).

## [D-04] The audit criteria can't see failures that need sequences or scale (lesson from P-01)

- **Risk:** Medium (applies to the audit, not to the product)
- **Where:** `AUDIT-CRITERIA.md`, IN-01 and ERR-02. Their methods check single requests, through the `verify:*` scripts.
- **Why not now:** changing the criteria between the before and after runs would break the comparison this sprint needs.
- **When to fix:** in the next audit cycle (after week 8). Add a method to ERR-02 that runs a deterministic property-style test over many request shapes **and sequences**, like `server/llm/prompt-invariants.test.ts`, and a check that a conversation past the body limit keeps working.

## [D-05] `verify:chat` fails if its screenshot folder doesn't exist

- **Risk:** Low (harness)
- **Where:** `scripts/verify-chat.mjs:154`. It writes screenshots without creating the folder, so it gets `ENOENT` after the first 4 checks. The audit noted it three times. It's the most likely cause of the one unexplained `verify:chat` exit 1 in the PO's regression run of 2026-10-02, whose output was lost to a bug in the PO's runner.
- **Why not now:** with an existing folder it passes (19/19, including under load), and the audit skill passes the system temp folder.
- **When to fix:** with week 8's deployment script, which will run the verifiers in CI-like conditions.

## [D-06] Each committed audit report adds SEC-01 noise

- **Risk:** Low (harness)
- **Where:** `scripts/audit-facts.mjs`. The secret scan counts the fake keys that every report quotes (10 → 12 hits). The auditor's judgment is unchanged ("fake fixtures"), but the number grows with every run.
- **When to fix:** in the next audit cycle. Exclude `docs/audit/` and `AUDIT-REPORT.md` from `secrets.tracked`, but still scan them in `secrets.history` for real keys.

## [D-07] The deploy tool's dependency tree has 16 high-severity advisories (DEP-02, accepted by the PO)

- **Risk:** reclassified by the PO from High to **Low**, for this cause only.
- **Where:** `netlify-cli` (devDependency, added 2026-10-02 for week 8). All 16 advisories are inside its own subtree: `braces`/`micromatch` regex DoS (via `fast-glob`, `zip-it-and-ship-it`, `http-proxy-middleware`), `node-forge` signature verification (via `listhen` → `ipx`), and `sharp`/libvips CVEs (via `@netlify/images`). npm's only suggested fix is `netlify-cli@2.13.1`, a 2019 major downgrade, so not a real fix.
- **Why it's accepted:** it's a **local deployment tool**. None of it ships. The browser bundle and the deployed Function are built from our code only, and every release checks that the deployed assets contain no deploy-tool code or keys. The DoS paths need attacker-controlled glob or regex input to a command we run ourselves. Keeping it in `package.json` keeps it **visible to the audit**. The alternative, `npx` per run, runs the same code while hiding it.
- **When to revisit:** at every release (the release skill re-reads `npm audit`). Fix immediately if an advisory reaches a **runtime** dependency (`dependencies`, or anything imported by `src/` or `server/`), or if a `netlify-cli` release clears them.

## [D-08] After a failed reply, a to-do phrase can leave the next question unanswered (found by the B-12 pass)

- **Risk:** Low. It needs a failed reply first, and only on engines without actions (Ollama, or the mock with tools off). Production on Claude isn't affected.
- **Where:** the server and the browser read different text to spot a to-do request. After a failed reply, the server merges the unanswered message with the new one (`fitHistory`), but the browser checks only the latest message. If the failed message was a to-do phrase and the new one is an ordinary question, the server holds the question back and the browser shows an empty reply.
- **Why not now:** it predates B-12, and B-12 doesn't make it worse. The fix is to have both sides decide on the same text, which touches the shared history logic that ADR-09's invariants protect, so it deserves its own contract and property test.
- **When to fix:** before the local engine is offered to anyone other than developers, or at the next change to `fitHistory`, whichever comes first.
