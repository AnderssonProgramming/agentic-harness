import type { ChatTurn, TodoAction, TodoRef } from '../../../src/shared/llm/protocol.ts';

export type EngineName = 'anthropic' | 'ollama' | 'mock';

export interface EngineStreamInput {
  system: string;
  messages: readonly ChatTurn[];
  /** The user's open to-dos; only engines with to-do tools use them (ADR-11). */
  todos: readonly TodoRef[];
  signal: AbortSignal;
}

/**
 * The tokens the provider reported for one reply (F-05). Each engine yields exactly one, last,
 * when the reply completes; zeros when the provider reported nothing. Logged, never sent.
 */
export interface TokenUsage {
  type: 'usage';
  input: number;
  output: number;
}

/** Text to show, a to-do action the model requested (ADR-11), or the reply's token usage. */
export type EngineChunk = string | TodoAction | TokenUsage;

/** One provider. stream() yields chunks and throws a ChatError on any failure. */
export interface Engine {
  name: EngineName;
  model: string;
  /** Whether it can request to-do actions (tool calling). False: to-do phrases never reach it (ADR-11). */
  actions: boolean;
  stream: (input: EngineStreamInput) => AsyncGenerator<EngineChunk>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
