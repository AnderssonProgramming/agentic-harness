import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_REPLY } from '../model/message';
import { useChat } from './use-chat';

describe('useChat', () => {
  it('starts with no messages', () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toEqual([]);
  });

  it('keeps every exchange in memory across renders', () => {
    const { result, rerender } = renderHook(() => useChat());

    act(() => {
      result.current.send('First question');
    });
    rerender();
    act(() => {
      result.current.send('Second question');
    });

    expect(result.current.messages.map((m) => m.text)).toEqual([
      'First question',
      PLACEHOLDER_REPLY,
      'Second question',
      PLACEHOLDER_REPLY,
    ]);
  });

  it('reports whether the draft was accepted', () => {
    const { result } = renderHook(() => useChat());
    let accepted = true;

    act(() => {
      accepted = result.current.send('   ');
    });

    expect(accepted).toBe(false);
    expect(result.current.messages).toEqual([]);
  });
});
