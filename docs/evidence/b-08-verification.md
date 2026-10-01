# B-08: the conversation survives closing the app

Date: 2026-10-01. Browser: headless Chrome/154.0.8037.58. Reproduce:

- `npm test`: unit and component tests for saving, restoring, migrating and clearing
- `npm run verify:persistence`: real Chrome on the mock engine, closed and started again on the same profile (starts its own dev server)
- `npm run lint`: the storage boundary rule (probe below)

The restart is real: the script closes Chrome with the DevTools `Browser.close` command, waits for the process to exit, and launches a new Chrome on the same `--user-data-dir`. Blocked and full storage are simulated before the app's code runs, with `Page.addScriptToEvaluateOnNewDocument`: the `localStorage` getter throws a `SecurityError`, or `Storage.prototype.setItem` throws a `QuotaExceededError`.

## Acceptance criteria

| Criterion             | Evidence                                                                                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic             | `useChat persistence` "saves at once when a message is sent and when a reply finishes, stops or fails", "saves streamed text at most once per interval", "flushes unsaved streamed text when the page is hidden"; browser "Automatic / Order and state" (no user action before the close)               |
| Survives a real close | Browser "Survives a real close": 4 messages before close, 4 after a Chrome restart on the same profile                                                                                                                                                                                                  |
| Order and state       | `restoreSnapshot` "round-trips order, author, text, status and error" and "brings a reply that was still streaming back as stopped, with its partial text"; browser: identical messages after restart, and `streaming → stopped` with 40 of 60 characters                                               |
| Clear history         | `NewConversation` and `ChatScreen` tests (Clear, Cancel, Escape, the handler re-checks `canClear`); `useChat` "clear stops the reply in progress and empties the conversation and storage"; browser "Clear history": Cancel keeps 6, Clear leaves storage `null`, still empty after a restart           |
| Storage failure       | `conversation store` blocked and full tests; `useChat` and `ChatScreen` "keeps … and shows a notice"; browser "Storage failure" for blocked and for full storage: the reply arrives and the notice is shown                                                                                             |
| Bad data              | `restoreSnapshot` reset tests (corrupted JSON, wrong shapes, unknown or future version, a migration that throws) and "migrates a known older version"; `conversation store` "reports corrupted data once and removes it"; browser "Bad data": empty chat, notice, key removed, no notice after a reload |
| Boundaries            | `conversation-store.ts` is the only file that reads storage; the lint probe below fails on all four ways of reaching it from a component                                                                                                                                                                |
| Evidence              | This file: 61 tests in the 7 files below, and `verify:persistence` 8/8                                                                                                                                                                                                                                  |

## Tests (`npm test`)

Run on its own with `npm test -- --reporter=verbose` and the 7 file paths below: 7 files, 61 tests, all pass.

`model/conversation-snapshot.test.ts` (`restoreSnapshot`)

- round-trips order, author, text, status and error
- brings a reply that was still streaming back as stopped, with its partial text
- reports an empty conversation when nothing was stored
- starts empty and reports a reset for: corrupted JSON; a value that is not an object; an array; missing messages; messages that are not an array; a message with a bad author; a message with a bad status; an error with an unknown code; an unknown older version; a future version; a version that is not a number
- migrates a known older version
- reports a reset when a migration throws

`model/message.test.ts` (`canClear`; the other 12 tests in this file predate B-08)

- is false for an empty conversation and true once there is a message
- is true while a reply is streaming, since clearing stops it first

`api/conversation-store.test.ts` (`conversation store`)

- loads what it saved
- reports blocked storage as unavailable instead of throwing
- reports full storage when a save exceeds the quota
- reports corrupted data once and removes it
- clears the saved conversation

`hooks/use-chat.test.ts` (`useChat persistence`)

- restores a saved conversation on the first render
- saves at once when a message is sent and when a reply finishes, stops or fails
- saves streamed text at most once per interval
- flushes unsaved streamed text when the page is hidden
- clear stops the reply in progress and empties the conversation and storage
- clear does nothing on an empty conversation, even when called directly
- keeps chatting in memory and shows a notice when storage is full
- shows a notice from the first render when storage is blocked or the saved data was unreadable

`components/storage-notice.test.tsx` (`StorageNotice`)

- keeps an empty status region when there is nothing to report
- explains the unavailable notice
- explains the full notice
- explains the reset notice

`components/new-conversation.test.tsx` (`NewConversation`)

- is disabled while the conversation is empty
- asks for confirmation before clearing, and clears on Clear
- keeps everything on Cancel or Escape and returns focus to the button
- re-checks canClear in the Clear handler, not only through the disabled state

`components/chat-screen.test.tsx` (`ChatScreen`, B-08 tests)

- keeps the conversation on Cancel and clears it after confirming
- keeps answering and shows a notice when the conversation cannot be saved

## Browser run (`npm run verify:persistence`): 8/8 pass

| ID                          | Criterion                                                                                  | Result | Measured                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Survives a real close       | After closing Chrome and starting it on the same profile, the conversation is back         | Pass   | 4 messages before close, 4 after restart                                                                                                     |
| Automatic / Order and state | Saved with no user action; same order, authors, text, status and error, and no notice      | Pass   | user:done assistant:done user:done assistant:error; notice: null                                                                             |
| Order and state             | A reply still streaming at close comes back stopped with its partial text                  | Pass   | streaming → stopped; 40 of 60 chars on screen at close were saved                                                                            |
| Clear history               | Cancel keeps everything; Clear empties screen and storage, still empty after a restart     | Pass   | {"afterCancel":6,"storedAfterClear":null,"afterRestart":{"items":0,"emptyState":true,"buttonDisabled":true}}                                 |
| Storage failure             | Blocked storage: the chat still answers and shows that the conversation won't be saved     | Pass   | reply done; notice: Your browser is blocking storage, so this conversation won't be saved when you close Compass.                            |
| Storage failure             | Full storage: the chat still answers and shows that the conversation won't be saved        | Pass   | reply done; notice: Your browser's storage is full, so this conversation won't be saved when you close Compass.                              |
| Bad data                    | Corrupted data gives an empty chat with a notice, is removed, and a reload shows no notice | Pass   | {"items":0,"notice":"Your previous conversation couldn't be restored, so Compass started a new one.","stored":null,"noticeAfterReload":null} |
| —                           | No console errors or exceptions                                                            | Pass   | none                                                                                                                                         |

The server logs `[llm] rate_limit: Simulated rate_limit error` during the run. That is the failed reply scenario (a) asks for on purpose, so the restart also proves a failed reply is saved.

**About the 20 missing characters.** The streaming reply had 60 characters on screen at close and 40 came back. That's within the agreed save cadence (PO decision 4): streamed text is saved at most once a second, so up to one second of it can be missing after a close. The `pagehide` flush didn't add the rest in this run. The criterion holds: the reply comes back `stopped` with its partial text, never `streaming`, and what was saved is a prefix of what was on screen.

## Boundary probe (`npm run lint`)

A temporary file `src/features/chat/components/storage-probe.ts`, deleted after the run:

```ts
export const a = localStorage;
export const b = window.localStorage;
export const c = sessionStorage;
export const d = window.sessionStorage;
```

`npm run -s lint -- src/features/chat/components/storage-probe.ts`:

```
C:\Users\Usuario\agentic-harness\src\features\chat\components\storage-probe.ts
  1:18  error  Unexpected use of 'localStorage'. Use the feature's api/ layer (ADR-07)                no-restricted-globals
  2:18  error  'localStorage' is restricted from being used. Use the feature's api/ layer (ADR-07)    no-restricted-properties
  3:18  error  Unexpected use of 'sessionStorage'. Use the feature's api/ layer (ADR-07)              no-restricted-globals
  4:18  error  'sessionStorage' is restricted from being used. Use the feature's api/ layer (ADR-07)  no-restricted-properties

✖ 4 problems (4 errors, 0 warnings)
```

The rule exempts `src/features/*/api/**`. Outside tests, `src/features/chat/api/conversation-store.ts` is the only file in `src/` that mentions `localStorage` or `sessionStorage` (ADR-10), and `npm run lint` passes on it.
