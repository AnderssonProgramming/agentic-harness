import { chatError } from '../../src/shared/llm/errors.ts';
import { LLM_CONFIG } from './config.ts';
import { anthropicEngine } from './engines/anthropic.ts';
import { mockEngine } from './engines/mock.ts';
import { ollamaEngine } from './engines/ollama.ts';
import type { Engine } from './engines/types.ts';

export type Env = Readonly<Record<string, string | undefined>>;

function setting(env: Env, name: string, fallback: string): string {
  const value = env[name]?.trim();
  return value === undefined || value === '' ? fallback : value;
}

/**
 * Picks the engine from INFERENCE_ENGINE (ADR-03). Chosen per request, so a bad configuration
 * becomes a "config" error in the conversation instead of a server that won't start.
 */
export function selectEngine(env: Env): Engine {
  const name = setting(env, 'INFERENCE_ENGINE', LLM_CONFIG.defaultEngine);
  switch (name) {
    case 'anthropic': {
      const apiKey = env.ANTHROPIC_API_KEY?.trim();
      if (!apiKey) {
        throw chatError(
          'config',
          'ANTHROPIC_API_KEY is empty. Set it in .env (without a VITE_ prefix).',
          'anthropic',
        );
      }
      return anthropicEngine({
        apiKey,
        model: setting(env, 'ANTHROPIC_MODEL', LLM_CONFIG.anthropicModel),
        maxOutputTokens: LLM_CONFIG.maxOutputTokens,
      });
    }
    case 'ollama':
      return ollamaEngine({
        baseUrl: setting(env, 'OLLAMA_BASE_URL', LLM_CONFIG.ollamaBaseUrl),
        model: setting(env, 'OLLAMA_MODEL', LLM_CONFIG.ollamaModel),
        maxOutputTokens: LLM_CONFIG.maxOutputTokens,
      });
    case 'mock':
      return mockEngine({
        delayMs: Number(setting(env, 'MOCK_DELAY_MS', '25')) || 0,
        tools: setting(env, 'MOCK_TOOLS', 'on') !== 'off',
      });
    default:
      throw chatError(
        'config',
        `INFERENCE_ENGINE="${name}" is not one of: anthropic, ollama, mock`,
      );
  }
}
