import { fetchEngineInfo, streamChat, type StreamChatOptions } from '../../../shared/llm/client';
import type { ChatTurn, EngineInfo } from '../../../shared/llm/protocol';

export type SendChat = (history: readonly ChatTurn[], options: StreamChatOptions) => Promise<void>;

/** Resolves to null when the engine is unknown (server unreachable, bad configuration). */
export type GetEngineInfo = () => Promise<EngineInfo | null>;

// Integration point (ADR-07): the chat's only way out to the model.
export const sendChat: SendChat = (history, options) => streamChat(history, options);

// Whether the active engine can run to-do actions, before the first message (ADR-11).
export const getEngineInfo: GetEngineInfo = () => fetchEngineInfo();
