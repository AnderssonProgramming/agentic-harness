import { chatError, isChatError } from '../../../src/shared/llm/errors.ts';
import { readLines } from '../../../src/shared/llm/lines.ts';
import { errorFromStatus, isRecord, parseJsonLine, upstreamFailure } from '../errors.ts';
import type { Engine, FetchLike } from './types.ts';

interface OllamaOptions {
  baseUrl: string;
  model: string;
  fetchImpl?: FetchLike;
}

/** A local model through Ollama's /api/chat, which streams one JSON object per line. */
export function ollamaEngine({ baseUrl, model, fetchImpl = fetch }: OllamaOptions): Engine {
  return {
    name: 'ollama',
    model,
    // No tools are declared: small local models don't call them reliably (ADR-11).
    actions: false,
    async *stream({ system, messages, signal }) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: true,
            messages: [{ role: 'system', content: system }, ...messages],
          }),
          signal,
        });
      } catch (error) {
        throw upstreamFailure('ollama', error, signal);
      }
      if (!response.ok) throw errorFromStatus('ollama', response.status, await response.text());
      if (!response.body) throw chatError('malformed', 'ollama sent an empty body', 'ollama');

      try {
        for await (const line of readLines(response.body, signal)) {
          if (line.trim() === '') continue;
          const chunk = parseJsonLine('ollama', line);
          if (!isRecord(chunk)) continue;
          if (typeof chunk.error === 'string') throw errorFromStatus('ollama', 500, chunk.error);
          if (
            isRecord(chunk.message) &&
            typeof chunk.message.content === 'string' &&
            chunk.message.content !== ''
          ) {
            yield chunk.message.content;
          }
          if (chunk.done === true) return;
        }
      } catch (error) {
        if (isChatError(error)) throw error;
        throw upstreamFailure('ollama', error, signal);
      }
      throw chatError('malformed', 'ollama stream ended without done', 'ollama');
    },
  };
}
