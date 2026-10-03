# Product Backlog

Product: **Compass**, a conversational onboarding assistant for junior developers.
Items are ordered by value. The agent executes them top to bottom, one at a time.

Status values: `pending`, `in progress`, `done`.

## Priority 1

### [B-01] Local chat screen

As a junior developer I want to type a message and see it on screen, so I know the app responds to me.

Acceptance criteria:

- When I type in the text field and press "Send", the message appears at the bottom of the list.
- My messages and the assistant's messages are visually distinct (alignment and color).
- The list auto-scrolls to the newest message after each send.
- Messages persist while the browser tab stays open (no reload).
- With 50 messages in the history, the screen stays responsive: sending a new message renders in under 100 ms.
- With no messages, the list shows a short explanation of what Compass is and what to type, instead of a blank area.

Status: done

### [B-02] Message composer behavior

As a junior developer I want the input to behave like a normal chat, so I don't lose or send broken messages.

Acceptance criteria:

- `Enter` sends the message; `Shift+Enter` inserts a new line.
- Empty or whitespace-only messages are not sent and the "Send" button is disabled.
- After sending, the input is cleared and keeps focus.
- Messages longer than 4,000 characters are blocked with a visible counter.

Status: done

### [B-03] Inference engine adapter (Anthropic by default)

As a junior developer I want my question answered by a language model, so I get a real reply instead of an echo.

Acceptance criteria:

- A single `Engine` interface on the server streams a reply for the whole history, and the browser receives it through `streamChat(history, { onDelta })` (ADR-09: streaming instead of `reply(history): Promise<string>`, so B-09 builds on the same path).
- The Anthropic implementation is used when `INFERENCE_ENGINE=anthropic` (the default).
- The API key is read only on the server side from `ANTHROPIC_API_KEY`; it never appears in the browser bundle (verified by searching `dist/`).
- While waiting, the UI shows a "thinking" indicator; the reply appears as an assistant message.

Status: done

## Priority 2

### [B-04] Local fallback engine (Ollama)

As a junior developer I want the assistant to keep working when API credits run out or content is sensitive, so I'm never blocked.

Acceptance criteria:

- Setting `INFERENCE_ENGINE=ollama` routes every request to `http://127.0.0.1:11434` using the model in `OLLAMA_MODEL` (default `phi3`).
- Switching engines requires only changing the environment variable and restarting; no code changes.
- `npm run engine:check` reports which engine is active and whether it answered.

Status: done

### [B-05] Clear error states

As a junior developer I want to understand what went wrong when the assistant can't answer, so I know whether to retry or switch engines.

Acceptance criteria:

- If the engine is unreachable, an inline error message appears in the conversation with a "Retry" button.
- Error messages name the active engine (e.g. "Ollama is not running on localhost:11434").
- A failed request never deletes the user's message.

Status: done

### [B-06] Onboarding knowledge base

As a junior developer I want the assistant to know my team's conventions, so its answers match how my team actually works.

Acceptance criteria:

- Markdown files placed in `knowledge/` are loaded and sent as context with each request.
- Asking "What is our branch naming convention?" returns the answer written in `knowledge/`.
- Files larger than 50 KB are skipped and listed in a warning in the console.

Status: pending

### [B-07] Cited answers

As a junior developer I want to see which document an answer came from, so I can read the original and trust the reply.

Acceptance criteria:

- Every answer based on `knowledge/` ends with the source file name(s).
- Clicking a source name shows the file content in a side panel.
- If no document applies, the assistant says so explicitly instead of inventing a source.

Status: pending

## Priority 3

### [B-08] Conversation survives closing the app

As a junior developer I want my conversation to still be there when I come back to Compass, even after closing the browser, so I can continue where I left off without repeating myself.

Acceptance criteria:

- **Automatic:** the conversation is saved after every change (a sent message, and a reply that finishes, stops or fails), with no user action.
- **Survives a real close:** after closing the browser completely and opening the app again, the previous conversation is there. This is verified by restarting the browser with the same profile, not only by a reload.
- **Order and state:** messages come back in their original order, with their author, text and status. A reply that was still streaming when the app closed comes back as `stopped` with its partial text, never stuck as `streaming`.
- **Clear history:** a "New conversation" action clears the conversation on screen and in storage after an explicit confirmation. Cancelling keeps everything.
- **Storage failure:** if storage is unavailable or full (blocked by the browser, quota exceeded), the chat keeps working in memory and shows a visible notice that the conversation won't be saved.
- **Bad data:** stored data that is corrupted, or saved in an older format, doesn't break the app. It's migrated if the format is known; otherwise the app starts with an empty conversation and says so once.
- **Boundaries:** storage is reached only through the chat feature's `api/` layer (ADR-07); components never touch `localStorage`.
- **Evidence:** unit tests for saving, restoring and migrating, plus a browser check that restarts the browser and that simulates blocked storage.

Status: done

### [B-09] Streaming replies

As a junior developer I want to see the answer appear as it's written, so long answers don't feel frozen.

Acceptance criteria:

- The first tokens appear on screen in under 2 seconds with the Anthropic engine.
- Streaming works with both engines.
- A "Stop" button interrupts the reply and keeps the partial text.

Status: done

### [B-10] Starter questions

As a junior developer on my first day I want suggested questions, so I know what I can ask.

Acceptance criteria:

- An empty conversation shows 3 to 5 suggested questions.
- Clicking a suggestion sends it as a message.
- Suggestions disappear once the conversation has at least one message.

Status: done (2026-10-03, delegated; evidence: `docs/evidence/b-10-verification.md`)

### [B-11] Onboarding to-do list the assistant manages

As a junior developer who doesn't want to interrupt seniors, I want to tell Compass what to remember ("remind me to ask Ana how deploys work") and later ask what's pending or say what I've done, so nothing I need to ask or do gets lost, and I can trust what Compass says about my list.

Acceptance criteria (observable behavior; "stored" means what's in the browser's storage, checked directly, not what the assistant says):

- **Add:** "Remind me to ask Ana how deploys work" → a new open to-do with that meaning is **stored**, and the chat shows a confirmation built from the stored item ("Added to your list: …").
- **List:** "What's on my list?" → the chat shows exactly the stored to-dos, open first, with done ones marked. The count matches storage. An empty list says it's empty.
- **Complete:** "Mark the deploy one as done" → that stored to-do becomes done, and the confirmation names it. If no to-do or more than one matches, nothing changes and Compass asks which one.
- **Honest failure:** if storage fails (blocked or full), the action isn't applied, the chat says clearly it couldn't save, and the app keeps working. **The chat never shows a confirmation for an action whose data didn't change.**
- **The model never claims success itself:** confirmations come only from the app, after the data changed. Text the model streams around an action can't say "done" or "added" on its own.
- **In-between states:** while an action runs, its card shows a pending state. It then turns into success or failure with a short transition, and there's no animation under `prefers-reduced-motion`.
- **Survives a restart:** to-dos and the conversation, including the confirmation cards, are still there after closing and reopening the browser.
- **Doesn't break the chat:** ordinary questions still stream ordinary replies, and the next turn after an action still has the conversation's context.
- **Engines:** works with Anthropic (live) and the mock engine (deterministic, for tests). With Ollama `phi3`, which has no tool calling, Compass answers in plain text and never shows a false confirmation.
- **Evidence:** unit tests for intent mapping, execution and failure, plus a browser check that reads storage directly, including a restart.

Status: done

### [B-12] "What's on my list?" answered from storage on every engine

As a junior developer using the local engine, I want to see my saved to-dos when I ask for them, because the list is on my machine and doesn't need a model to read it.

Acceptance criteria:

- With an engine that can't run actions, "What's on my list?" shows the stored to-dos, the same card as with Claude, read from storage. The model isn't called.
- Adding or completing on such an engine is still refused, as now (B-11 Amendment 1).
- Evidence: a `verify:todos` scenario with `MOCK_TOOLS=off` that compares the card with storage.

Origin: the PO's ADR-11 review, correction 3. The B-11 amendment said "not performed" for every phrase, and that contradicted the feature's own principle (data, not model).

Status: done (evidence: `docs/evidence/b-12-verification.md`)

### [B-13] The local engine's first reply doesn't time out while the model loads

As a junior developer on the local engine, I want my first question to be answered even when the model is still loading, so switching to Ollama (B-04) works on the first try.

Acceptance criteria:

- The first reply from a cold Ollama model on CPU gets a longer wait for its first chunk than the 20 s idle timeout. The idle timeout between chunks is unchanged.
- While waiting, the typing indicator stays visible, and a stalled engine still ends in the `timeout` error.
- Evidence: a test with a fake engine whose first chunk is slow, and a live run with Ollama loading cold.

Origin: the PO's ADR-11 review, correction 4. The first `phi3` reply timed out twice in week 6.

Status: done (2026-10-03, delegated; evidence: `docs/evidence/b-13-verification.md`)
