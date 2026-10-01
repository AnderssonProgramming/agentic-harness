import { chatError, isChatError } from '../../../src/shared/llm/errors.ts';
import { readLines } from '../../../src/shared/llm/lines.ts';
import {
  errorFromAnthropicType,
  errorFromStatus,
  isRecord,
  parseJsonLine,
  upstreamFailure,
} from '../errors.ts';
import { actionFromToolUse, TODO_TOOLS, todoContext } from '../todo-tools.ts';
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
    async *stream({ system, messages, todos, signal }) {
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
            system: `${system}\n\n${todoContext(todos)}`,
            messages,
            max_tokens: maxOutputTokens,
            stream: true,
            tools: TODO_TOOLS,
            // One action per reply, so each reply has at most one card (ADR-11).
            tool_choice: { type: 'auto', disable_parallel_tool_use: true },
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
      // A tool call arrives as content_block_start, input_json_delta fragments, content_block_stop.
      const toolCalls = new Map<number, { name: string; json: string }>();
      let actionSent = false;
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

          const index = typeof event.index === 'number' ? event.index : -1;
          if (event.type === 'content_block_start' && isRecord(event.content_block)) {
            const block = event.content_block;
            if (block.type === 'tool_use' && typeof block.name === 'string') {
              toolCalls.set(index, { name: block.name, json: '' });
            }
          } else if (event.type === 'content_block_delta' && isRecord(event.delta)) {
            const call = toolCalls.get(index);
            if (event.delta.type === 'text_delta' && typeof event.delta.text === 'string') {
              yield event.delta.text;
            } else if (
              call &&
              event.delta.type === 'input_json_delta' &&
              typeof event.delta.partial_json === 'string'
            ) {
              call.json += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop' && toolCalls.has(index)) {
            const call = toolCalls.get(index);
            toolCalls.delete(index);
            if (call && !actionSent) {
              const input = call.json === '' ? {} : parseJsonLine('anthropic', call.json);
              const action = actionFromToolUse(call.name, input);
              if (!action) {
                throw chatError(
                  'malformed',
                  `anthropic called ${call.name} with bad input`,
                  'anthropic',
                );
              }
              actionSent = true;
              yield action;
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
