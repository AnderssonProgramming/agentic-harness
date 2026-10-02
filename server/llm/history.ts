import { chatError } from '../../src/shared/llm/errors.ts';
import {
  MAX_MESSAGE_LENGTH,
  MAX_TODO_LENGTH,
  MAX_TODOS_SENT,
} from '../../src/shared/llm/limits.ts';
import { isTodoRef, type ChatTurn, type TodoRef } from '../../src/shared/llm/protocol.ts';
import { isRecord } from './errors.ts';

/** The open to-dos sent with the request (ADR-11). Missing means none; anything else invalid throws "bad_request". */
export function parseTodoRefs(body: unknown): TodoRef[] {
  if (!isRecord(body) || body.todos === undefined) return [];
  if (!Array.isArray(body.todos) || !body.todos.every(isTodoRef)) {
    throw chatError('bad_request', 'todos must be [{ id: string, text: string }]');
  }
  // Every ref goes into every prompt, so both bounds cap the cost of each request (F-04).
  if (body.todos.length > MAX_TODOS_SENT) {
    throw chatError('bad_request', `todos has more than ${String(MAX_TODOS_SENT)} items`);
  }
  if (body.todos.some((todo) => todo.text.length > MAX_TODO_LENGTH)) {
    throw chatError('bad_request', `a to-do is longer than ${String(MAX_TODO_LENGTH)} characters`);
  }
  return body.todos.map(({ id, text }) => ({ id, text }));
}

/** Validates the request body and returns its messages. Throws "bad_request" otherwise. */
export function parseChatRequest(body: unknown): ChatTurn[] {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    throw chatError('bad_request', 'Expected a JSON body like { "messages": [...] }');
  }
  const messages = body.messages.map((item: unknown, index): ChatTurn => {
    if (
      !isRecord(item) ||
      (item.role !== 'user' && item.role !== 'assistant') ||
      typeof item.content !== 'string'
    ) {
      throw chatError(
        'bad_request',
        `messages[${String(index)}] must be { role: "user" | "assistant", content: string }`,
      );
    }
    // The browser never sends a longer message (checkDraft); anything longer skipped the UI.
    if (item.role === 'user' && item.content.length > MAX_MESSAGE_LENGTH) {
      throw chatError(
        'bad_request',
        `messages[${String(index)}] is longer than ${String(MAX_MESSAGE_LENGTH)} characters`,
      );
    }
    return { role: item.role, content: item.content };
  });
  if (messages.at(-1)?.role !== 'user') {
    throw chatError('bad_request', 'The last message must come from the user');
  }
  return messages;
}

/**
 * What is sent to the model on each call: the whole conversation while it fits the budget,
 * otherwise the newest turns. The result starts and ends with a user turn and never has two
 * turns in a row from the same role (they are merged), which every provider accepts.
 * The total never exceeds `maxChars`: a newest merged turn that alone exceeds it throws
 * "bad_request" (back-to-back user messages would otherwise bypass the per-message cap, IN-02).
 */
export function trimHistory(messages: readonly ChatTurn[], maxChars: number): ChatTurn[] {
  const merged: ChatTurn[] = [];
  for (const turn of messages) {
    if (turn.content.trim() === '') continue;
    const previous = merged.at(-1);
    if (previous?.role === turn.role) {
      merged[merged.length - 1] = {
        role: turn.role,
        content: `${previous.content}\n\n${turn.content}`,
      };
    } else {
      merged.push({ ...turn });
    }
  }

  const newest = merged.at(-1);
  if (newest !== undefined && newest.content.length > maxChars) {
    throw chatError(
      'bad_request',
      `The newest message, merged with the unanswered ones before it, is longer than ${String(maxChars)} characters`,
    );
  }

  const kept: ChatTurn[] = [];
  let used = 0;
  for (const turn of [...merged].reverse()) {
    if (used + turn.content.length > maxChars) break;
    kept.unshift(turn);
    used += turn.content.length;
  }
  while (kept[0]?.role === 'assistant') kept.shift();
  return kept;
}
