// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_TODO_ID_LENGTH,
  MAX_TODO_LENGTH,
  MAX_TODOS_SENT,
} from '../../src/shared/llm/limits.ts';
import { SYSTEM_PROMPT } from './system-prompt.ts';
import { MAX_PROMPT_ADDITIONS, promptAdditionsLength, systemWithTodos } from './todo-tools.ts';

describe('prompt additions (LLM-05)', () => {
  it('stay under the named bound in the worst case the shared limits allow', () => {
    const worst = Array.from({ length: MAX_TODOS_SENT }, () => ({
      id: 'i'.repeat(MAX_TODO_ID_LENGTH),
      text: 't'.repeat(MAX_TODO_LENGTH),
    }));
    expect(promptAdditionsLength(SYSTEM_PROMPT, worst)).toBeLessThanOrEqual(MAX_PROMPT_ADDITIONS);
  });

  it('count the system prompt, every id and text, and the tool definitions', () => {
    const todos = [{ id: 'abc', text: 'read the guide' }];
    const system = systemWithTodos(SYSTEM_PROMPT, todos);
    expect(system).toContain('- abc: read the guide');
    expect(promptAdditionsLength(SYSTEM_PROMPT, todos)).toBeGreaterThan(system.length);
  });
});
