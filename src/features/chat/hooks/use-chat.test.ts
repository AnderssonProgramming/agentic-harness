import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StreamChatOptions } from '../../../shared/llm/client';
import { chatError } from '../../../shared/llm/errors';
import type { ChatTurn } from '../../../shared/llm/protocol';
import type { SendChat } from '../api/chat-api';
import { useChat } from './use-chat';

/** A fake model connection the test drives by hand: emit text, then finish or fail. */
function controllableSend() {
  const calls: {
    history: readonly ChatTurn[];
    options: StreamChatOptions;
    finish: () => void;
    fail: (e: unknown) => void;
  }[] = [];
  const send: SendChat = (history, options) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ history, options, finish: resolve, fail: reject });
      options.signal?.addEventListener('abort', () => {
        reject(chatError('aborted', 'stopped'));
      });
    });
  const last = () => {
    const call = calls.at(-1);
    if (!call) throw new Error('send was not called');
    return call;
  };
  return { send, calls, last };
}

describe('useChat', () => {
  it('starts empty and not replying', () => {
    const { result } = renderHook(() => useChat({ send: vi.fn() }));
    expect(result.current.messages).toEqual([]);
    expect(result.current.replying).toBe(false);
  });

  it('streams the reply into the conversation and finishes it', async () => {
    const model = controllableSend();
    const { result } = renderHook(() => useChat({ send: model.send }));

    act(() => {
      result.current.send('Hello');
    });
    expect(result.current.replying).toBe(true);
    expect(result.current.messages.at(-1)).toMatchObject({
      author: 'assistant',
      text: '',
      status: 'streaming',
    });

    act(() => {
      model.last().options.onDelta('Hi ');
      model.last().options.onDelta('there');
    });
    expect(result.current.messages.at(-1)?.text).toBe('Hi there');

    await act(async () => {
      model.last().finish();
      await Promise.resolve();
    });
    expect(result.current.messages.at(-1)?.status).toBe('done');
    expect(result.current.replying).toBe(false);
  });

  it('blocks a second send while a reply is streaming', () => {
    const model = controllableSend();
    const { result } = renderHook(() => useChat({ send: model.send }));
    let second = true;
    act(() => {
      result.current.send('First');
      second = result.current.send('Second');
    });
    expect(second).toBe(false);
    expect(model.calls).toHaveLength(1);
    expect(result.current.messages.filter((m) => m.author === 'user')).toHaveLength(1);
  });

  it('sends the whole earlier conversation with each new message', async () => {
    const model = controllableSend();
    const { result } = renderHook(() => useChat({ send: model.send }));
    for (const question of ['One', 'Two', 'Three']) {
      act(() => {
        result.current.send(question);
      });
      await act(async () => {
        model.last().options.onDelta(`Re: ${question}`);
        model.last().finish();
        await Promise.resolve();
      });
    }
    expect(model.last().history).toEqual([
      { role: 'user', content: 'One' },
      { role: 'assistant', content: 'Re: One' },
      { role: 'user', content: 'Two' },
      { role: 'assistant', content: 'Re: Two' },
      { role: 'user', content: 'Three' },
    ]);
  });

  it('shows a failure on the reply, keeps the user message, and retries with the same history', async () => {
    const model = controllableSend();
    const { result } = renderHook(() => useChat({ send: model.send }));
    act(() => {
      result.current.send('Hello');
    });
    await act(async () => {
      model.last().fail(chatError('network', 'Failed to fetch'));
      await Promise.resolve();
    });

    const reply = result.current.messages.at(-1);
    expect(reply).toMatchObject({ status: 'error', error: { code: 'network' } });
    expect(result.current.messages[0]).toMatchObject({ author: 'user', text: 'Hello' });

    act(() => {
      result.current.retry(reply?.id ?? '');
    });
    expect(model.calls).toHaveLength(2);
    expect(model.last().history).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(result.current.messages.at(-1)?.status).toBe('streaming');
  });

  it('stops a reply on request and keeps the partial text', async () => {
    const model = controllableSend();
    const { result } = renderHook(() => useChat({ send: model.send }));
    act(() => {
      result.current.send('Tell me a long story');
    });
    act(() => {
      model.last().options.onDelta('Once upon');
    });
    await act(async () => {
      result.current.stop();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.messages.at(-1)).toMatchObject({
        text: 'Once upon',
        status: 'stopped',
      });
    });
    expect(result.current.replying).toBe(false);
  });
});
