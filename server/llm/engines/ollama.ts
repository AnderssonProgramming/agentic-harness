import { chatError, isChatError } from '../../../src/shared/llm/errors.ts';
import { readLines } from '../../../src/shared/llm/lines.ts';
import { errorFromStatus, isRecord, parseJsonLine, upstreamFailure } from '../errors.ts';
import type { Engine, FetchLike } from './types.ts';

interface OllamaOptions {
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  fetchImpl?: FetchLike;
}

/** A local model through Ollama's /api/chat, which streams one JSON object per line. */
export function ollamaEngine({
  baseUrl,
  model,
  maxOutputTokens,
  fetchImpl = fetch,
}: OllamaOptions): Engine {
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
            // The same output cap as every engine (ADR-03); Ollama calls it num_predict (F-03).
            options: { num_predict: maxOutputTokens },
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
          if (chunk.done === true) {
            // The final chunk carries the token counts (F-05).
            yield {
              type: 'usage',
              input: typeof chunk.prompt_eval_count === 'number' ? chunk.prompt_eval_count : 0,
              output: typeof chunk.eval_count === 'number' ? chunk.eval_count : 0,
            };
            return;
          }
        }
      } catch (error) {
        if (isChatError(error)) throw error;
        throw upstreamFailure('ollama', error, signal);
      }
      throw chatError('malformed', 'ollama stream ended without done', 'ollama');
    },
  };
}
