import { describe, expect, it } from 'vitest';
import { chatError, describeChatError, isChatError } from './errors.ts';

describe('chatError', () => {
  it('is an Error carrying a code, the engine and whether a retry can help', () => {
    const error = chatError('rate_limit', 'HTTP 429', 'anthropic');
    expect(error).toBeInstanceOf(Error);
    expect(isChatError(error)).toBe(true);
    expect(error.info).toEqual({
      code: 'rate_limit',
      message: 'HTTP 429',
      engine: 'anthropic',
      retryable: true,
    });
    expect(chatError('auth', 'HTTP 401').info.retryable).toBe(false);
  });
});

describe('describeChatError', () => {
  it('gives the user an actionable sentence that names the engine', () => {
    expect(describeChatError(chatError('network', 'Failed to fetch').info)).toMatch(
      /internet connection/,
    );
    expect(
      describeChatError(chatError('engine_unreachable', 'ECONNREFUSED', 'ollama').info),
    ).toMatch(/ollama serve/);
    expect(describeChatError(chatError('auth', 'HTTP 401', 'anthropic').info)).toMatch(
      /^Claude rejected/,
    );
    expect(describeChatError(chatError('quota', 'credit balance', 'anthropic').info)).toMatch(
      /INFERENCE_ENGINE=ollama/,
    );
  });

  it('never leaks the technical detail', () => {
    const info = chatError('unknown', 'TypeError: secret stack trace').info;
    expect(describeChatError(info)).not.toContain('stack trace');
  });
});
