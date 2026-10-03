# B-10 Starter questions: verification

Date: 2026-10-03. Delegation: `docs/delegations/b-10-starter-questions.md`. Engine for the browser checks: mock (`verify:chat` sets it).

Screenshots of these runs went to a git-ignored scratch folder (`coverage/b-10-verify/`); no committed evidence changed.

## Criteria

| Criterion                                                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                              | Result |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| An empty conversation shows the 4 suggestions                                                   | `starter-questions.test.tsx` ("shows the four agreed questions as buttons, in order"); `message-list.test.tsx` ("offers the 4 starter questions only while the conversation is empty"); `verify:chat` row **B-10 #1**                                                                                                                                                                 | Pass   |
| Clicking one sends it as a user message, and a reply streams                                    | `chat-screen.test.tsx` ("sends a starter question like a typed one…"): the user message and echoed reply are on screen, the history sent to the engine is the question, and **stored** data (`conversationStore.load()`) holds both messages; `verify:chat` row **B-10 #2** on the mock engine: `.message--streaming` observed, reply `done` and contains the question, input focused | Pass   |
| Suggestions disappear once there's at least one message, and come back after "New conversation" | `message-list.test.tsx` (hidden after a rerender with one message); `chat-screen.test.tsx` (gone after the click, 4 again after New conversation → Clear); `verify:chat` rows **B-10 #2** (`suggestionsLeft: 0`) and **B-10 #3**                                                                                                                                                      | Pass   |
| Keyboard reachable                                                                              | `starter-questions.test.tsx` ("picks a question on click and from the keyboard": Tab focuses the first, Enter picks it)                                                                                                                                                                                                                                                               | Pass   |
| Same validation as the composer                                                                 | `starter-questions.test.tsx` ("re-checks the draft rules before picking"); the screen passes `useChat`'s `send`, which runs `startExchange` (`checkDraft` + `isReplying`)                                                                                                                                                                                                             | Pass   |
| No regression                                                                                   | `npm run -s check`: 36 files, 329 tests passed; `npm run verify:chat -- coverage/b-10-verify`: 3 runs, exit 0, no failed row; `npm run verify:persistence -- coverage/b-10-verify`: 3 runs, 8/8 rows, exit 0                                                                                                                                                                          | Pass   |

## B-10 rows from `verify:chat` (last run)

```
B-10 #1  An empty conversation shows the 4 suggested questions                        pass
B-10 #3  Suggestions come back after "New conversation"                               pass  4 suggestions
B-10 #2  Clicking a suggestion sends it as a user message and a reply streams (mock)  pass
         {"users":["How do deploys work here?"],"sawStreaming":true,"status":"done","suggestionsLeft":0,"inputFocused":true}
```

## Not covered

- Focus style and reduced motion are CSS (`chat.css`: `:focus-visible` outline, `transition: none` under `prefers-reduced-motion`); no automated check measures them.
