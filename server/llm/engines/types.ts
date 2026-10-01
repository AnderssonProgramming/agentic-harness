import type { ChatTurn, TodoAction, TodoRef } from '../../../src/shared/llm/protocol.ts';

export type EngineName = 'anthropic' | 'ollama' | 'mock';

export interface EngineStreamInput {
  system: string;
  messages: readonly ChatTurn[];
  /** The user's open to-dos; only engines with to-do tools use them (ADR-11). */
  todos: readonly TodoRef[];
  signal: AbortSignal;
}

/** Text to show, or a to-do action the model requested (ADR-11). */
export type EngineChunk = string | TodoAction;

/** One provider. stream() yields chunks and throws a ChatError on any failure. */
export interface Engine {
  name: EngineName;
  model: string;
  stream: (input: EngineStreamInput) => AsyncGenerator<EngineChunk>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
