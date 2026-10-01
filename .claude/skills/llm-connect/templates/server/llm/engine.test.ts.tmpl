// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isChatError } from '../../src/shared/llm/errors.ts';
import { LLM_CONFIG } from './config.ts';
import { selectEngine } from './engine.ts';

function thrownCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return isChatError(error) ? error.info.code : 'not a ChatError';
  }
  return 'did not throw';
}

describe('selectEngine', () => {
  it('uses the configured default when INFERENCE_ENGINE is not set', () => {
    const env = { ANTHROPIC_API_KEY: 'k' };
    expect(selectEngine(env).name).toBe(LLM_CONFIG.defaultEngine);
  });

  it('switches engines by environment variable only (B-04)', () => {
    expect(selectEngine({ INFERENCE_ENGINE: 'ollama' })).toMatchObject({
      name: 'ollama',
      model: LLM_CONFIG.ollamaModel,
    });
    expect(selectEngine({ INFERENCE_ENGINE: 'ollama', OLLAMA_MODEL: 'llama3:8b' }).model).toBe(
      'llama3:8b',
    );
    expect(selectEngine({ INFERENCE_ENGINE: 'mock' }).name).toBe('mock');
    expect(
      selectEngine({ INFERENCE_ENGINE: 'anthropic', ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'm' })
        .model,
    ).toBe('m');
  });

  it('fails with "config" for a missing key or an unknown engine', () => {
    expect(
      thrownCode(() => selectEngine({ INFERENCE_ENGINE: 'anthropic', ANTHROPIC_API_KEY: ' ' })),
    ).toBe('config');
    expect(thrownCode(() => selectEngine({ INFERENCE_ENGINE: 'gpt' }))).toBe('config');
  });
});
