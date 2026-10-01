import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamChatOptions } from '../../../shared/llm/client';
import { chatError } from '../../../shared/llm/errors';
import type { ChatTurn } from '../../../shared/llm/protocol';
import type { SendChat } from '../api/chat-api';
import type { ConversationStore, LoadResult, StoreResult } from '../api/conversation-store';
import type { Message } from '../model/message';
import { TEXT_SAVE_INTERVAL_MS, useChat } from './use-chat';

afterEach(() => {
  vi.useRealTimers();
});

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

/** An in-memory store that records every write; `saved` is null once cleared. */
function fakeStore(
  loaded: LoadResult = { ok: true, conversation: { messages: [], outcome: 'empty' } },
  result: StoreResult = { ok: true },
) {
  const state = { saved: null as readonly Message[] | null, writes: 0 };
  const store: ConversationStore = {
    load: () => loaded,
    save: (messages) => {
      state.writes++;
      state.saved = messages;
      return result;
    },
    clear: () => {
      state.writes++;
      state.saved = null;
      return result;
    },
  };
  return { store, state };
}

function renderChat(send: SendChat, store = fakeStore().store) {
  return renderHook(() => useChat({ send, store }));
}

const savedConversation: readonly Message[] = [
  { id: 'id-1', author: 'user', text: 'Hi', createdAt: 1_000, status: 'done', error: null },
  {
    id: 'id-2',
    author: 'assistant',
    text: 'Half',
    createdAt: 1_000,
    status: 'stopped',
    error: null,
  },
];

describe('useChat', () => {
  it('starts empty and not replying', () => {
    const { result } = renderChat(vi.fn());
    expect(result.current.messages).toEqual([]);
    expect(result.current.replying).toBe(false);
    expect(result.current.storageNotice).toBeNull();
  });

  it('streams the reply into the conversation and finishes it', async () => {
    const model = controllableSend();
    const { result } = renderChat(model.send);

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
    const { result } = renderChat(model.send);
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
    const { result } = renderChat(model.send);
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
    const { result } = renderChat(model.send);
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
    const { result } = renderChat(model.send);
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

describe('useChat persistence', () => {
  it('restores a saved conversation on the first render', () => {
    const { store } = fakeStore({
      ok: true,
      conversation: { messages: savedConversation, outcome: 'restored' },
    });
    const { result } = renderChat(vi.fn(), store);
    expect(result.current.messages).toEqual(savedConversation);
    expect(result.current.storageNotice).toBeNull();
  });

  it('saves at once when a message is sent and when a reply finishes, stops or fails', async () => {
    const model = controllableSend();
    const { store, state } = fakeStore();
    const { result } = renderChat(model.send, store);
    const savedStatuses = () => state.saved?.map((m) => m.status);

    act(() => {
      result.current.send('One');
    });
    expect(savedStatuses()).toEqual(['done', 'streaming']);

    await act(async () => {
      model.last().finish();
      await Promise.resolve();
    });
    expect(savedStatuses()).toEqual(['done', 'done']);

    act(() => {
      result.current.send('Two');
    });
    await act(async () => {
      result.current.stop();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(savedStatuses()?.at(-1)).toBe('stopped');
    });

    act(() => {
      result.current.send('Three');
    });
    await act(async () => {
      model.last().fail(chatError('network', 'Failed to fetch'));
      await Promise.resolve();
    });
    expect(state.saved?.at(-1)).toMatchObject({ status: 'error', error: { code: 'network' } });
  });

  it('saves streamed text at most once per interval', () => {
    vi.useFakeTimers();
    const model = controllableSend();
    const { store, state } = fakeStore();
    const { result } = renderChat(model.send, store);
    act(() => {
      result.current.send('Hello');
    });
    const afterSend = state.writes;

    act(() => {
      model.last().options.onDelta('One ');
      model.last().options.onDelta('two ');
      model.last().options.onDelta('three');
    });
    expect(state.writes).toBe(afterSend);

    act(() => {
      vi.advanceTimersByTime(TEXT_SAVE_INTERVAL_MS);
    });
    expect(state.writes).toBe(afterSend + 1);
    expect(state.saved?.at(-1)?.text).toBe('One two three');
  });

  it('flushes unsaved streamed text when the page is hidden', () => {
    const model = controllableSend();
    const { store, state } = fakeStore();
    const { result } = renderChat(model.send, store);
    act(() => {
      result.current.send('Hello');
      model.last().options.onDelta('Partial');
    });
    expect(state.saved?.at(-1)?.text).toBe('');

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(state.saved?.at(-1)).toMatchObject({ text: 'Partial', status: 'streaming' });
  });

  it('clear stops the reply in progress and empties the conversation and storage', async () => {
    const model = controllableSend();
    const { store, state } = fakeStore();
    const { result } = renderChat(model.send, store);
    act(() => {
      result.current.send('Hello');
      model.last().options.onDelta('Partial');
    });

    await act(async () => {
      result.current.clear();
      await Promise.resolve();
    });
    expect(model.last().options.signal?.aborted).toBe(true);
    expect(result.current.messages).toEqual([]);
    expect(result.current.replying).toBe(false);
    expect(state.saved).toBeNull();
  });

  it('clear does nothing on an empty conversation, even when called directly', () => {
    const { store, state } = fakeStore();
    const { result } = renderChat(vi.fn(), store);
    act(() => {
      result.current.clear();
    });
    expect(state.writes).toBe(0);
  });

  it('keeps chatting in memory and shows a notice when storage is full', async () => {
    const model = controllableSend();
    const { store } = fakeStore(undefined, { ok: false, reason: 'full' });
    const { result } = renderChat(model.send, store);
    act(() => {
      result.current.send('Hello');
    });
    expect(result.current.storageNotice).toBe('full');

    await act(async () => {
      model.last().options.onDelta('Still here');
      model.last().finish();
      await Promise.resolve();
    });
    expect(result.current.messages.at(-1)).toMatchObject({ text: 'Still here', status: 'done' });
  });

  it('shows a notice from the first render when storage is blocked or the saved data was unreadable', () => {
    const blocked = fakeStore({ ok: false, reason: 'unavailable' }).store;
    expect(renderChat(vi.fn(), blocked).result.current.storageNotice).toBe('unavailable');

    const reset = fakeStore({ ok: true, conversation: { messages: [], outcome: 'reset' } }).store;
    const { result } = renderChat(vi.fn(), reset);
    expect(result.current.messages).toEqual([]);
    expect(result.current.storageNotice).toBe('reset');
  });
});
