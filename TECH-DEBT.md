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

## [D-04] The audit criteria can't see failures that need sequences or scale (lesson from P-01)

- **Risk:** Medium (applies to the audit, not to the product)
- **Where:** `AUDIT-CRITERIA.md`, IN-01 and ERR-02. Their methods check single requests, through the `verify:*` scripts.
- **Why not now:** changing the criteria between the before and after runs would break the comparison this sprint needs.
- **When to fix:** in the next audit cycle (after week 8). Add a method to ERR-02 that runs a deterministic property-style test over many request shapes **and sequences**, like `server/llm/prompt-invariants.test.ts`, and a check that a conversation past the body limit keeps working.
