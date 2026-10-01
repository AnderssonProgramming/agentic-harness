import type { ChatErrorInfo, ChatTurn, TodoAction } from '../../../shared/llm/protocol';
import { cardSummary, type TodoActionState, type TodoCard } from '../../todos';

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
  /** A to-do action the reply requested, and then the app's card for it (B-11, ADR-11). */
  action: TodoActionState | null;
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

/** Decides both whether "New conversation" is enabled and whether its handler acts. */
export function canClear(messages: readonly Message[]): boolean {
  return messages.length > 0;
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
    action: null,
  };
  const reply: Message = {
    id: source.newId(),
    author: 'assistant',
    text: '',
    createdAt: source.now(),
    status: 'streaming',
    error: null,
    action: null,
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

/** Text that arrives after a to-do action is dropped: only the app's card speaks for it (ADR-11). */
export function appendToReply(messages: readonly Message[], replyId: string, text: string) {
  return updateReply(messages, replyId, (reply) =>
    reply.action ? reply : { ...reply, text: reply.text + text },
  );
}

export function finishReply(messages: readonly Message[], replyId: string) {
  return updateReply(messages, replyId, (reply) => ({ ...reply, status: 'done' }));
}

/**
 * The reply asked for a to-do action: its card shows as pending, and any text the model streamed
 * is dropped, so it can't confirm anything on its own (B-11). Only the first action counts.
 */
export function startAction(messages: readonly Message[], replyId: string, request: TodoAction) {
  return updateReply(messages, replyId, (reply) =>
    reply.action ? reply : { ...reply, text: '', action: { status: 'pending', request } },
  );
}

/** The app ran the action: the reply is done and shows the card built from storage. */
export function settleAction(messages: readonly Message[], replyId: string, card: TodoCard) {
  return updateReply(messages, replyId, (reply) => ({
    ...reply,
    status: 'done',
    action: { status: 'settled', card },
  }));
}

/** Keeps any partial text. A user's Stop is "stopped", not an error. A pending action never runs. */
export function failReply(messages: readonly Message[], replyId: string, error: ChatErrorInfo) {
  return updateReply(messages, replyId, (reply) => {
    const action = reply.action?.status === 'pending' ? null : reply.action;
    return error.code === 'aborted'
      ? { ...reply, status: 'stopped', action }
      : { ...reply, status: 'error', error, action };
  });
}

/** Clears a failed reply so it can be streamed again. The user's message is never touched (B-05). */
export function resetReply(messages: readonly Message[], replyId: string) {
  return updateReply(messages, replyId, (reply) => ({
    ...reply,
    text: '',
    status: 'streaming',
    error: null,
    action: null,
  }));
}

/** What the model reads for a message: the text, or for a to-do action the app's card (B-11). */
function turnContent(message: Message): string {
  return message.action?.status === 'settled' ? cardSummary(message.action.card) : message.text;
}

/**
 * The conversation sent to the model: everything before `replyId`, skipping replies that failed
 * or have no text. Stopped replies are kept, so the model knows what it already said.
 */
export function historyBefore(messages: readonly Message[], replyId: string): ChatTurn[] {
  const end = messages.findIndex((message) => message.id === replyId);
  return (end === -1 ? messages : messages.slice(0, end))
    .map((message) => ({ message, content: turnContent(message) }))
    .filter(
      ({ message, content }) =>
        message.author === 'user' || (message.status !== 'error' && content !== ''),
    )
    .map(({ message, content }) => ({ role: message.author, content }));
}
