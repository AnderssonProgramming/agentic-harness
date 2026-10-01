import { chatError, isChatError } from '../../../src/shared/llm/errors.ts';
import { readLines } from '../../../src/shared/llm/lines.ts';
import {
  errorFromAnthropicType,
  errorFromStatus,
  isRecord,
  parseJsonLine,
  upstreamFailure,
} from '../errors.ts';
import type { Engine, FetchLike } from './types.ts';

interface AnthropicOptions {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  fetchImpl?: FetchLike;
}

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

/** Claude via the Messages API with server-sent events (stream: true). */
export function anthropicEngine({
  apiKey,
  model,
  maxOutputTokens,
  fetchImpl = fetch,
}: AnthropicOptions): Engine {
  return {
    name: 'anthropic',
    model,
    async *stream({ system, messages, signal }) {
      let response: Response;
      try {
        response = await fetchImpl(MESSAGES_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            system,
            messages,
            max_tokens: maxOutputTokens,
            stream: true,
          }),
          signal,
        });
      } catch (error) {
        throw upstreamFailure('anthropic', error, signal);
      }
      if (!response.ok) throw errorFromStatus('anthropic', response.status, await response.text());
      if (!response.body) throw chatError('malformed', 'anthropic sent an empty body', 'anthropic');

      // SSE: "event:" and "data:" lines, one event per blank-line-terminated block.
      let data: string[] = [];
      try {
        for await (const line of readLines(response.body, signal)) {
          if (line.startsWith('data:')) {
            data.push(line.slice(5).trimStart());
            continue;
          }
          if (line !== '' || data.length === 0) continue;
          const event = parseJsonLine('anthropic', data.join('\n'));
          data = [];
          if (!isRecord(event)) continue;

          if (event.type === 'content_block_delta' && isRecord(event.delta)) {
            if (event.delta.type === 'text_delta' && typeof event.delta.text === 'string') {
              yield event.delta.text;
            }
          } else if (event.type === 'error' && isRecord(event.error)) {
            const { type, message } = event.error;
            throw errorFromAnthropicType(
              typeof type === 'string' ? type : 'unknown',
              typeof message === 'string' ? message : '',
            );
          } else if (event.type === 'message_stop') {
            return;
          }
        }
      } catch (error) {
        if (isChatError(error)) throw error;
        throw upstreamFailure('anthropic', error, signal);
      }
      throw chatError('malformed', 'anthropic stream ended without message_stop', 'anthropic');
    },
  };
}
