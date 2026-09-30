# Code walkthrough: the chat feature

A line-by-line explanation of `src/features/chat/`, written so the Product Owner can explain every line (Definition of Done, condition 5). Line numbers match the code at the commit that added this file.

## The flow in one picture

```
user presses Enter
  → Composer.handleKeyDown → submit()          checks the draft, calls onSend
  → useChat.send(draft)                         checks again, updates state
  → appendExchange(previous, draft, source)     pure: returns a NEW list with 2 more messages
  → React re-renders ChatScreen
  → MessageList draws the list                  pure drawing from props
  → useAutoScroll sees messages.length changed  jumps to the bottom before paint
```

Three layers, each with one job:

| Layer      | Files                                     | Job                                 | Knows about React? |
| ---------- | ----------------------------------------- | ----------------------------------- | ------------------ |
| Model      | `model/message.ts`                        | What a message is and the rules     | No                 |
| Hooks      | `hooks/use-chat.ts`, `use-auto-scroll.ts` | Hold state, cause effects           | Yes                |
| Components | `components/*.tsx`                        | Draw things and report user actions | Yes                |

---

## `model/message.ts`: the rules, with no React

| Line  | Code                                               | What it does                                                                                  | Why it's like this                                                                                                                                           |
| ----- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `type Author = 'user' \| 'assistant'`              | A message can only come from these two authors.                                               | A union of string literals: the compiler rejects typos like `'asistant'`, and the CSS class `message--${author}` can only take two values.                   |
| 3–8   | `interface Message`                                | The shape of one message: `id`, `author`, `text`, `createdAt` (milliseconds).                 | `id` is for React's `key` (see MessageList); `createdAt` isn't shown yet but B-08 (saving) will need it.                                                     |
| 10–13 | `interface MessageSource`                          | Two functions: one makes a new id, one says what time it is.                                  | **Dependency injection.** The real app passes `crypto.randomUUID` and `Date.now`; tests pass fakes (`id-1`, `id-2`…, fixed time) so results are predictable. |
| 15–16 | `type DraftCheck`                                  | The result of checking a draft: either valid with the cleaned text, or invalid with a reason. | A **discriminated union**: after `if (check.valid)`, TypeScript knows `check.text` exists; otherwise it knows `check.reason` exists. No `null`s.             |
| 18    | `MAX_MESSAGE_LENGTH = 4000`                        | The limit from B-02.                                                                          | One constant used by the rule (line 27), the counter (Composer line 58) and the tests, so they can't disagree.                                               |
| 20–22 | `PLACEHOLDER_REPLY`                                | The fixed text Compass answers with.                                                          | ADR-05: B-01 needs assistant messages, Sprint 1 forbids model calls. The comment explains the _why_, which isn't obvious from the code.                      |
| 24    | `function checkDraft(draft)`                       | Decides whether a draft can be sent.                                                          | The **single source of truth** for validation. The button, the Enter key and the hook all call it.                                                           |
| 25    | `const text = draft.trim()`                        | Removes spaces and new lines at the start and end.                                            | So `"   "` counts as empty, but new lines _inside_ the message are kept.                                                                                     |
| 26    | `if (text.length === 0) return … 'empty'`          | Rejects empty drafts.                                                                         | B-02: whitespace-only messages are not sent.                                                                                                                 |
| 27    | `if (text.length > MAX…) return … 'too-long'`      | Rejects drafts over 4,000 characters.                                                         | B-02 limit. Exactly 4,000 is allowed (tested).                                                                                                               |
| 28    | `return { valid: true, text }`                     | Accepts, returning the trimmed text.                                                          | The caller stores the cleaned version, not the raw input.                                                                                                    |
| 31–33 | `function createMessage(author, text, source)`     | Builds one `Message` object.                                                                  | Gets its id and time from `source`, so it has no hidden dependency on the clock.                                                                             |
| 35–39 | `function appendExchange(messages, draft, source)` | Takes the current list and a draft, returns the next list.                                    | `readonly Message[]`: TypeScript forbids `messages.push(...)` here, so the function _can't_ modify the list it received.                                     |
| 40–41 | `checkDraft` … `return messages`                   | If the draft is invalid, returns the **same** list, unchanged.                                | Returning the identical object tells React "nothing changed", so it skips re-rendering. A test checks this with `toBe`.                                      |
| 42–46 | `return [...messages, user, assistant]`            | Makes a **new** array: all old messages, then the user's message, then the placeholder reply. | React detects changes by comparing references. Pushing into the old array would leave the reference the same and the screen wouldn't update.                 |

---

## `hooks/use-chat.ts`: where the conversation lives

| Line | Code                                           | What it does                                                              | Why it's like this                                                                                                                                                                      |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `import { useCallback, useState }`             | Two React hooks.                                                          | `useState` keeps data between renders; `useCallback` keeps a function stable between renders.                                                                                           |
| 2    | `import … type Message, type MessageSource`    | `type` imports disappear at build time.                                   | Required by `verbatimModuleSyntax` in our tsconfig: it makes clear which imports are code and which are only types.                                                                     |
| 4–7  | `const browserSource = { … }`                  | The real id and clock: `crypto.randomUUID()` and `Date.now()`.            | Defined **outside** the hook, so it's the same object on every render. If it were created inside, `send` (line 17) would be rebuilt every render.                                       |
| 9–12 | `interface Chat`                               | What the hook returns: the messages and a `send` function.                | An explicit return type is the hook's contract with `ChatScreen`.                                                                                                                       |
| 14   | `useChat(source = browserSource)`              | The hook. `source` is optional.                                           | The app calls `useChat()`; a test could pass a fake source.                                                                                                                             |
| 15   | `useState<readonly Message[]>([])`             | Creates the message list, starting empty. Returns the value and a setter. | This is **the** memory of the conversation (B-01: "persists while the tab is open"). It lives as long as the component stays on screen; a reload clears it, which is B-08's job to fix. |
| 17   | `const send = useCallback(…, [source])`        | Creates `send` once and reuses it while `source` doesn't change.          | `send` is passed to `Composer` as a prop. A stable function avoids unnecessary work and is what B-03 will build on.                                                                     |
| 19   | `if (!checkDraft(draft).valid) return false`   | Rejects invalid drafts and tells the caller.                              | The caller (`Composer`) needs a yes/no **right now** to decide whether to clear the input. The state update on line 20 happens later, so its result can't be used for that.             |
| 20   | `setMessages((previous) => appendExchange(…))` | Asks React to replace the list with the next one.                         | The **function form** (`previous => …`) always gets the latest list, even if two sends happen before React re-renders. Using `messages` directly could lose a message.                  |
| 21   | `return true`                                  | Confirms the message was accepted.                                        |                                                                                                                                                                                         |
| 26   | `return { messages, send }`                    | Gives the component the data and the action.                              |                                                                                                                                                                                         |

**If someone asks "why is the draft checked twice (lines 19 and inside `appendExchange`)?":** line 19 answers the caller immediately; `appendExchange` stays safe on its own, so it can be reused (e.g. by B-10's starter questions) without trusting the caller.

---

## `hooks/use-auto-scroll.ts`: follow the newest message

| Line | Code                                              | What it does                                                        | Why it's like this                                                                                                                                                |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3    | comment                                           | Explains the choice of layout effect.                               | It's the non-obvious _why_, so it's allowed by our comment rule.                                                                                                  |
| 4    | `useAutoScroll<T extends HTMLElement>(itemCount)` | A **generic** hook: works with a `div`, a `section`, any element.   | `ChatScreen` asks for `HTMLDivElement`, so the returned ref type matches the `<div>` exactly.                                                                     |
| 5    | `useRef<T>(null)`                                 | A box that will hold the real DOM element once React draws it.      | Refs survive re-renders and changing them doesn't cause one.                                                                                                      |
| 7    | `useLayoutEffect(() => { … }, [itemCount])`       | Runs after React updates the DOM but **before the browser paints**. | With `useEffect` the user could see one frame at the old scroll position and then a jump. The dependency `[itemCount]` means it runs only when the count changes. |
| 8–9  | `container && itemCount > 0`                      | Only scrolls if the element exists and there are messages.          | On the first render the empty state is showing; there's nothing to scroll to.                                                                                     |
| 10   | `scrollTop = scrollHeight`                        | Moves the scroll position to the very bottom.                       | `scrollHeight` is the full content height; asking for more than the maximum lands exactly at the bottom. B-01: "auto-scrolls to the newest message".              |
| 14   | `return containerRef`                             | The component attaches this to the scrolling element.               |                                                                                                                                                                   |

**Known limitation to mention honestly:** it always jumps to the bottom on a new message, even if the user had scrolled up to reread something. That's fine now because new messages only arrive when _you_ send. When replies stream in (B-09), we'll want "only follow if already at the bottom".

---

## `components/composer.tsx`: the input box

| Line  | Code                                        | What it does                                                                              | Why it's like this                                                                                                                                                                     |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4–6   | `interface ComposerProps { onSend }`        | The only input is a callback that returns whether the message was accepted.               | Props-only rule: the Composer doesn't know where messages are stored.                                                                                                                  |
| 9     | `useState('')` → `draft`                    | What's currently typed.                                                                   | Ephemeral input state, the one exception allowed in presentational components (ADR-04 and CLAUDE.md).                                                                                  |
| 10    | `useRef<HTMLTextAreaElement>(null)`         | A handle on the textarea.                                                                 | Needed to put focus back after clicking Send (B-02).                                                                                                                                   |
| 11    | `const check = checkDraft(draft)`           | Validates on **every render**.                                                            | Validity is _derived_ from the draft, so it isn't stored in its own state: it can't get out of sync.                                                                                   |
| 12    | `const tooLong = …`                         | True only when the reason is `'too-long'`.                                                | An empty box isn't an error to show in red; an over-long one is.                                                                                                                       |
| 14–17 | `function submit()`                         | If valid **and** the parent accepts, clears the draft. Always returns focus to the input. | Line 15 is the **Enter-key bug fix**: before, Enter skipped the disabled button and sent `"   "`. Now the handler re-checks (CLAUDE.md: "a disabled control is never the only guard"). |
| 19–22 | `handleSubmit`                              | Runs when the form submits (Send button click).                                           | `preventDefault()` stops the browser from reloading the page, which is what a plain HTML form does.                                                                                    |
| 24–30 | `handleKeyDown`                             | Enter without Shift sends; Shift+Enter falls through and the textarea adds a new line.    | `preventDefault()` stops Enter from also inserting a new line. `isComposing` avoids sending while typing accented or Asian characters with an input method.                            |
| 33    | `<form onSubmit=…>`                         | A real form.                                                                              | Screen readers and the keyboard understand forms natively.                                                                                                                             |
| 34–36 | hidden `<label>`                            | Names the textarea "Message" without showing text.                                        | Accessibility, and it's how the tests find it: `getByRole('textbox', { name: 'Message' })`.                                                                                            |
| 41    | `value={draft}`                             | **Controlled** input: React is the source of truth for what's in the box.                 | So `setDraft('')` actually empties the box.                                                                                                                                            |
| 44–45 | `aria-describedby`, `aria-invalid`          | Links the counter to the input and flags the error state.                                 | A screen reader announces "invalid" and reads the counter. The CSS also uses `aria-invalid` to turn the border red.                                                                    |
| 46    | `autoFocus`                                 | The cursor is in the box when the page opens.                                             | You can type immediately.                                                                                                                                                              |
| 47–49 | `onChange={… setDraft(event.target.value)}` | Every keystroke updates the draft.                                                        | Standard controlled-input pattern.                                                                                                                                                     |
| 53–59 | counter `<span>`                            | Shows `n / 4000`, prefixed with "Too long:" and styled red when over.                     | B-02: "visible counter". It counts the _trimmed_ length, the same thing the rule checks.                                                                                               |
| 60    | `<button disabled={!check.valid}>`          | Send is greyed out for empty or too-long drafts.                                          | B-02 visual feedback; the real guard is line 15.                                                                                                                                       |

---

## `components/message-list.tsx`: drawing the conversation

| Line  | Code                                                 | What it does                                             | Why it's like this                                                                                                                                                      |
| ----- | ---------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3–5   | `MessageListProps { messages }`                      | Receives the list; nothing else.                         | Pure presentation: same props, same output. No hooks at all.                                                                                                            |
| 7     | `authorLabel = { … } as const`                       | Maps `user` → "You", `assistant` → "Compass".            | `as const` makes the keys exactly the two `Author` values, so `authorLabel[message.author]` is type-checked.                                                            |
| 10–20 | `if (messages.length === 0)` → empty state           | With no messages, shows a heading and example questions. | The empty-state criterion added to B-01 before building. `&ldquo;`/`&rdquo;` are HTML entities for curly quotes (“ ”), a typographic choice; plain `"` would also work. |
| 23    | `<ol role="log" aria-live="polite">`                 | An ordered list marked as a live log.                    | `role="log"` + `aria-live` make screen readers announce new messages without interrupting. It's also how tests find the list.                                           |
| 24    | `messages.map(…)`                                    | One `<li>` per message, in order.                        | Newest is last, so it's at the bottom (B-01).                                                                                                                           |
| 25    | `key={message.id}`                                   | Tells React which `<li>` is which message.               | With a stable id, React only adds the new items instead of redrawing all 50. That's part of why a send takes ~12 ms.                                                    |
| 25    | ``className={`message message--${message.author}`}`` | Adds `message--user` or `message--assistant`.            | The CSS aligns and colors by this class (B-01: visually distinct).                                                                                                      |
| 27    | `<p>{message.text}</p>`                              | The text.                                                | React escapes it automatically, so a message containing `<script>` is shown as text, not run. CSS `white-space: pre-wrap` keeps new lines.                              |

---

## `components/chat-screen.tsx`: putting it together

| Line | Code                                             | What it does                                    | Why it's like this                                                                                                  |
| ---- | ------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1    | `import '../chat.css'`                           | Loads this feature's styles.                    | Styles travel with the feature (ADR-01); Vite bundles them.                                                         |
| 7    | `export function ChatScreen()`                   | The feature's composition component.            | The **only** component allowed to call feature hooks (CLAUDE.md).                                                   |
| 8    | `const { messages, send } = useChat()`           | Gets the conversation and the send action.      |                                                                                                                     |
| 9    | `useAutoScroll<HTMLDivElement>(messages.length)` | Gets a ref that scrolls when the count changes. | Passes only the count, not the list: scrolling cares about "how many", not "which".                                 |
| 13   | `<div className="chat__scroll" ref={scrollRef}>` | The scrollable area.                            | The ref goes on the element that has `overflow-y: auto` in CSS, so that's the one that scrolls, not the whole page. |
| 14   | `<MessageList messages={messages} />`            | Data flows **down** as props.                   |                                                                                                                     |
| 16   | `<Composer onSend={send} />`                     | Actions flow **up** through a callback.         | Composer never sees the list; MessageList never sees `send`. Each part can be tested alone.                         |

---

## The 60-second version

> "The chat has three layers. `message.ts` holds the rules as plain functions: a draft is valid if it's not empty and at most 4,000 characters, and sending returns a _new_ list with my message plus a fixed placeholder reply, because we don't call a model in Sprint 1. `useChat` keeps that list in React state and exposes `send`. The components only draw: `MessageList` renders what it's given, and `Composer` reports what I typed. `ChatScreen` wires them together, and `useAutoScroll` jumps to the bottom before the browser paints. Validation lives in one function that the button, the Enter key and the hook all share. That's how a test caught Enter sending blank messages, and why fixing it took one line."

## Questions you might get

- **Why return a new array instead of `push`?** React compares references to decide what changed. Same array, no re-render.
- **Why `useLayoutEffect` and not `useEffect`?** It runs before paint, so the user never sees the list at the old scroll position.
- **Where does the state go on reload?** Nowhere yet: it's memory only. B-08 adds `localStorage`, inside `useChat`, without touching the components.
- **What changes when the model arrives (B-03)?** `appendExchange` stops adding the placeholder; `useChat.send` becomes async and calls our server. The components stay the same.
- **In development, React StrictMode runs state updaters twice. Is that a problem?** No. The updater on line 20 of `use-chat.ts` only builds a new list; the second run's result is thrown away. Nothing is sent anywhere, so nothing happens twice.
