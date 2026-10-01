import type { ChatErrorInfo, ChatTurn } from '../../../shared/llm/protocol';

export type Author = 'user' | 'assistant';

/** User messages are always "done"; an assistant reply moves from "streaming" to one of the others. */
export type MessageStatus = 'streaming' | 'done' | 'error' | 'stopped';

export interface Message {
  id: string;
  author: Author;
  text: string;
  createdAt: number;
  status: MessageStatus;
  error: ChatErrorInfo | null;
}

export interface MessageSource {
  newId: () => string;
  now: () => number;
}

export type DraftCheck =
  { valid: true; text: string } | { valid: false; reason: 'empty' | 'too-long' };

export const MAX_MESSAGE_LENGTH = 4000;

export function checkDraft(draft: string): DraftCheck {
  const text = draft.trim();
  if (text.length === 0) return { valid: false, reason: 'empty' };
  if (text.length > MAX_MESSAGE_LENGTH) return { valid: false, reason: 'too-long' };
  return { valid: true, text };
}

export function isReplying(messages: readonly Message[]): boolean {
  return messages.some((message) => message.status === 'streaming');
}

/**
 * Adds the user's message and an empty assistant reply that will be streamed into.
 * Returns null for an invalid draft, or while another reply is still streaming (no double send).
 */
export function startExchange(
  messages: readonly Message[],
  draft: string,
  source: MessageSource,
): { messages: readonly Message[]; replyId: string } | null {
  const check = checkDraft(draft);
  if (!check.valid || isReplying(messages)) return null;
  const user: Message = {
    id: source.newId(),
    author: 'user',
    text: check.text,
    createdAt: source.now(),
    status: 'done',
    error: null,
  };
  const reply: Message = {
    id: source.newId(),
    author: 'assistant',
    text: '',
    createdAt: source.now(),
    status: 'streaming',
    error: null,
  };
  return { messages: [...messages, user, reply], replyId: reply.id };
}

function updateReply(
  messages: readonly Message[],
  replyId: string,
  change: (reply: Message) => Message,
): readonly Message[] {
  return messages.map((message) => (message.id === replyId ? change(message) : message));
}

export function appendToReply(messages: readonly Message[], replyId: string, text: string) {
  return updateReply(messages, replyId, (reply) => ({ ...reply, text: reply.text + text }));
}

export function finishReply(messages: readonly Message[], replyId: string) {
  return updateReply(messages, replyId, (reply) => ({ ...reply, status: 'done' }));
}

/** Keeps any partial text. A user's Stop is "stopped", not an error. */
export function failReply(messages: readonly Message[], replyId: string, error: ChatErrorInfo) {
  return updateReply(messages, replyId, (reply) =>
    error.code === 'aborted'
      ? { ...reply, status: 'stopped' }
      : { ...reply, status: 'error', error },
  );
}

/** Clears a failed reply so it can be streamed again. The user's message is never touched (B-05). */
export function resetReply(messages: readonly Message[], replyId: string) {
  return updateReply(messages, replyId, (reply) => ({
    ...reply,
    text: '',
    status: 'streaming',
    error: null,
  }));
}

/**
 * The conversation sent to the model: everything before `replyId`, skipping replies that failed
 * or have no text. Stopped replies are kept, so the model knows what it already said.
 */
export function historyBefore(messages: readonly Message[], replyId: string): ChatTurn[] {
  const end = messages.findIndex((message) => message.id === replyId);
  return (end === -1 ? messages : messages.slice(0, end))
    .filter(
      (message) => message.author === 'user' || (message.status !== 'error' && message.text !== ''),
    )
    .map((message) => ({ role: message.author, content: message.text }));
}
