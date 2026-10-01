import { streamChat, type StreamChatOptions } from '../../../shared/llm/client';
import type { ChatTurn } from '../../../shared/llm/protocol';

export type SendChat = (history: readonly ChatTurn[], options: StreamChatOptions) => Promise<void>;

// Integration point (ADR-07): the chat's only way out to the model.
export const sendChat: SendChat = (history, options) => streamChat(history, options);
