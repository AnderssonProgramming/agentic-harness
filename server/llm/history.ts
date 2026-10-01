import { chatError } from '../../src/shared/llm/errors.ts';
import { isTodoRef, type ChatTurn, type TodoRef } from '../../src/shared/llm/protocol.ts';
import { isRecord } from './errors.ts';

/** The open to-dos sent with the request (ADR-11). Missing means none; anything else invalid throws "bad_request". */
export function parseTodoRefs(body: unknown): TodoRef[] {
  if (!isRecord(body) || body.todos === undefined) return [];
  if (!Array.isArray(body.todos) || !body.todos.every(isTodoRef)) {
    throw chatError('bad_request', 'todos must be [{ id: string, text: string }]');
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

  const kept: ChatTurn[] = [];
  let used = 0;
  for (const turn of [...merged].reverse()) {
    // The newest turn is always kept, even if it alone exceeds the budget.
    if (kept.length > 0 && used + turn.content.length > maxChars) break;
    kept.unshift(turn);
    used += turn.content.length;
  }
  while (kept[0]?.role === 'assistant') kept.shift();
  return kept;
}
