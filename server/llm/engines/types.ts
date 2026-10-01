import type { ChatTurn } from '../../../src/shared/llm/protocol.ts';

export type EngineName = 'anthropic' | 'ollama' | 'mock';

export interface EngineStreamInput {
  system: string;
  messages: readonly ChatTurn[];
  signal: AbortSignal;
}

/** One provider. stream() yields text chunks and throws a ChatError on any failure. */
export interface Engine {
  name: EngineName;
  model: string;
  stream: (input: EngineStreamInput) => AsyncGenerator<string>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
