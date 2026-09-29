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

Status: pending

### [B-02] Message composer behavior
As a junior developer I want the input to behave like a normal chat, so I don't lose or send broken messages.

Acceptance criteria:
- `Enter` sends the message; `Shift+Enter` inserts a new line.
- Empty or whitespace-only messages are not sent and the "Send" button is disabled.
- After sending, the input is cleared and keeps focus.
- Messages longer than 4,000 characters are blocked with a visible counter.

Status: pending

### [B-03] Inference engine adapter (Anthropic by default)
As a junior developer I want my question answered by a language model, so I get a real reply instead of an echo.

Acceptance criteria:
- A single `InferenceEngine` interface exposes `reply(history): Promise<string>`.
- The Anthropic implementation is used when `INFERENCE_ENGINE=anthropic` (the default).
- The API key is read only on the server side from `ANTHROPIC_API_KEY`; it never appears in the browser bundle (verified by searching `dist/`).
- While waiting, the UI shows a "thinking" indicator; the reply appears as an assistant message.

Status: pending

## Priority 2

### [B-04] Local fallback engine (Ollama)
As a junior developer I want the assistant to keep working when API credits run out or content is sensitive, so I'm never blocked.

Acceptance criteria:
- Setting `INFERENCE_ENGINE=ollama` routes every request to `http://localhost:11434` using the model in `OLLAMA_MODEL` (default `phi3`).
- Switching engines requires only changing the environment variable and restarting; no code changes.
- `npm run engine:check` reports which engine is active and whether it answered.

Status: pending

### [B-05] Clear error states
As a junior developer I want to understand what went wrong when the assistant can't answer, so I know whether to retry or switch engines.

Acceptance criteria:
- If the engine is unreachable, an inline error message appears in the conversation with a "Retry" button.
- Error messages name the active engine (e.g. "Ollama is not running on localhost:11434").
- A failed request never deletes the user's message.

Status: pending

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

### [B-08] Conversation survives a reload
As a junior developer I want my conversation to still be there after reloading the page, so I can continue where I left off.

Acceptance criteria:
- The conversation is saved to `localStorage` after each message.
- Reloading the page restores all messages in order.
- A "New conversation" button clears the history after a confirmation.

Status: pending

### [B-09] Streaming replies
As a junior developer I want to see the answer appear as it's written, so long answers don't feel frozen.

Acceptance criteria:
- The first tokens appear on screen in under 2 seconds with the Anthropic engine.
- Streaming works with both engines.
- A "Stop" button interrupts the reply and keeps the partial text.

Status: pending

### [B-10] Starter questions
As a junior developer on my first day I want suggested questions, so I know what I can ask.

Acceptance criteria:
- An empty conversation shows 3 to 5 suggested questions.
- Clicking a suggestion sends it as a message.
- Suggestions disappear once the conversation has at least one message.

Status: pending
