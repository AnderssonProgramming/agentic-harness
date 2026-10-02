import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamChatOptions } from '../../../shared/llm/client';
import { chatError } from '../../../shared/llm/errors';
import type { ChatTurn } from '../../../shared/llm/protocol';
import type { SendChat } from '../api/chat-api';
import type { ConversationStore, LoadResult, StoreResult } from '../api/conversation-store';
import type { TodoActions, TodoCard } from '../../todos';
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

/** A to-do list the test controls: what's open, and the card each action produces. */
function fakeTodos(card: TodoCard = { kind: 'listed', todos: [] }) {
  const todos: TodoActions = {
    restore: vi.fn(() => ({ reset: false })),
    openRefs: vi.fn(() => [{ id: 't1', text: 'ask Ana how deploys work' }]),
    execute: vi.fn(() => card),
  };
  return todos;
}

const unknownEngine = () => Promise.resolve(null);

function renderChat(send: SendChat, store = fakeStore().store, todos = fakeTodos()) {
  return renderHook(() => useChat({ send, store, todos, engineInfo: unknownEngine }));
}

const savedConversation: readonly Message[] = [
  {
    id: 'id-1',
    author: 'user',
    text: 'Hi',
    createdAt: 1_000,
    status: 'done',
    error: null,
    actions: [],
  },
  {
    id: 'id-2',
    author: 'assistant',
    text: 'Half',
    createdAt: 1_000,
    status: 'stopped',
    error: null,
    actions: [],
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

  describe('to-do actions (B-11)', () => {
    const added: TodoCard = {
      kind: 'added',
      todo: { id: 't9', text: 'ask Ana how deploys work', done: false },
    };

    it('sends the open to-dos, shows a pending card, and runs the action only when the reply ends', async () => {
      const model = controllableSend();
      const { store, state } = fakeStore();
      const todos = fakeTodos(added);
      const { result } = renderChat(model.send, store, todos);
      act(() => {
        result.current.send('Remind me to ask Ana how deploys work');
      });
      expect(model.last().options.todos).toEqual([{ id: 't1', text: 'ask Ana how deploys work' }]);

      act(() => {
        model.last().options.onDelta('Sure, I added it!');
        model.last().options.onAction?.({ kind: 'add', text: 'ask Ana how deploys work' });
        model.last().options.onDelta(' Done.');
      });
      expect(result.current.messages.at(-1)).toMatchObject({
        text: '',
        status: 'streaming',
        actions: [{ status: 'pending', request: { kind: 'add' } }],
      });
      expect(todos.execute).not.toHaveBeenCalled();

      await act(async () => {
        model.last().finish();
        await Promise.resolve();
      });
      expect(todos.execute).toHaveBeenCalledTimes(1);
      expect(result.current.messages.at(-1)).toMatchObject({
        text: '',
        status: 'done',
        actions: [{ status: 'settled', card: added }],
      });
      expect(state.saved?.at(-1)?.actions).toEqual([{ status: 'settled', card: added }]);
    });

    it('runs every action of a reply in order, each with its own card (Amendment 1)', async () => {
      const model = controllableSend();
      const { store, state } = fakeStore();
      const listed: TodoCard = { kind: 'listed', todos: [] };
      const todos = fakeTodos(added);
      vi.mocked(todos.execute).mockReturnValueOnce(added).mockReturnValueOnce(listed);
      const { result } = renderChat(model.send, store, todos);
      act(() => {
        result.current.send('Remind me to ask Ana how deploys work. What is on my list?');
      });
      await act(async () => {
        model.last().options.onAction?.({ kind: 'add', text: 'ask Ana how deploys work' });
        model.last().options.onAction?.({ kind: 'list' });
        model.last().finish();
        await Promise.resolve();
      });
      expect(vi.mocked(todos.execute).mock.calls).toEqual([
        [{ kind: 'add', text: 'ask Ana how deploys work' }],
        [{ kind: 'list' }],
      ]);
      const cards = [
        { status: 'settled', card: added },
        { status: 'settled', card: listed },
      ];
      expect(result.current.messages.at(-1)).toMatchObject({ status: 'done', actions: cards });
      expect(state.saved?.at(-1)?.actions).toEqual(cards);
    });

    describe('with an engine that cannot run actions (Amendment 1)', () => {
      const noActions = { engine: 'ollama', model: 'phi3', actions: false };

      it('shows the engine notice before the first message, and hides it for an engine with actions', async () => {
        const { result } = renderHook(() =>
          useChat({
            send: vi.fn(),
            store: fakeStore().store,
            todos: fakeTodos(),
            engineInfo: () => Promise.resolve(noActions),
          }),
        );
        expect(result.current.engineActions).toBeNull();
        await waitFor(() => {
          expect(result.current.engineActions).toBe(false);
        });

        const model = controllableSend();
        const other = renderChat(model.send);
        act(() => {
          other.result.current.send('Hi');
          model.last().options.onStart?.({ engine: 'mock', model: 'echo', actions: true });
        });
        expect(other.result.current.engineActions).toBe(true);
      });

      it('replies to a to-do phrase with refusal cards and never touches the list', async () => {
        const model = controllableSend();
        const { store, state } = fakeStore();
        const todos = fakeTodos();
        const { result } = renderChat(model.send, store, todos);
        act(() => {
          result.current.send("Remind me to ask Ana how deploys work. What's on my list?");
        });
        await act(async () => {
          model.last().options.onStart?.(noActions);
          model.last().finish();
          await Promise.resolve();
        });
        expect(todos.execute).not.toHaveBeenCalled();
        const refused = [
          { status: 'settled', card: { kind: 'unsupported', action: 'add' } },
          { status: 'settled', card: { kind: 'unsupported', action: 'list' } },
        ];
        expect(result.current.messages.at(-1)).toMatchObject({
          text: '',
          status: 'done',
          actions: refused,
        });
        expect(state.saved?.at(-1)?.actions).toEqual(refused);
        expect(result.current.engineActions).toBe(false);
      });

      it('lets other wording reach the model as before', async () => {
        const model = controllableSend();
        const { result } = renderChat(model.send);
        act(() => {
          result.current.send('Can you remind me how deploys work?');
        });
        await act(async () => {
          model.last().options.onStart?.(noActions);
          model.last().options.onDelta('You run the deploy script.');
          model.last().finish();
          await Promise.resolve();
        });
        expect(result.current.messages.at(-1)).toMatchObject({
          text: 'You run the deploy script.',
          status: 'done',
          actions: [],
        });
      });
    });

    it('says once that an unreadable to-do list was reset, until a new conversation (Amendment 1)', () => {
      const todos = fakeTodos();
      vi.mocked(todos.restore).mockReturnValueOnce({ reset: true });
      const { result } = renderChat(vi.fn(), fakeStore().store, todos);
      expect(result.current.todosReset).toBe(true);
      expect(todos.restore).toHaveBeenCalledTimes(1);
      act(() => {
        result.current.send('Hi');
      });
      act(() => {
        result.current.clear();
      });
      expect(result.current.todosReset).toBe(false);
    });

    it.each([
      ['fails', chatError('network', 'offline'), 'error'],
      ['is stopped', chatError('aborted', 'stopped'), 'stopped'],
    ])('never runs the action when the reply %s', async (_, error, status) => {
      const model = controllableSend();
      const todos = fakeTodos(added);
      const { result } = renderChat(model.send, fakeStore().store, todos);
      act(() => {
        result.current.send('Remind me to ask Ana how deploys work');
      });
      await act(async () => {
        model.last().options.onAction?.({ kind: 'add', text: 'ask Ana how deploys work' });
        model.last().fail(error);
        await Promise.resolve();
      });
      expect(todos.execute).not.toHaveBeenCalled();
      expect(result.current.messages.at(-1)).toMatchObject({ status, actions: [] });
    });

    it('gives the next turn the card as context', async () => {
      const model = controllableSend();
      const { result } = renderChat(model.send, fakeStore().store, fakeTodos(added));
      act(() => {
        result.current.send('Remind me to ask Ana how deploys work');
      });
      await act(async () => {
        model.last().options.onAction?.({ kind: 'add', text: 'ask Ana how deploys work' });
        model.last().finish();
        await Promise.resolve();
      });
      act(() => {
        result.current.send('Thanks');
      });
      expect(model.last().history).toEqual([
        { role: 'user', content: 'Remind me to ask Ana how deploys work' },
        {
          role: 'assistant',
          content: "[The app's to-do list] Added to your list: ask Ana how deploys work",
        },
        { role: 'user', content: 'Thanks' },
      ]);
    });

    it('keeps ordinary replies unchanged and runs no action', async () => {
      const model = controllableSend();
      const todos = fakeTodos();
      const { result } = renderChat(model.send, fakeStore().store, todos);
      act(() => {
        result.current.send('How do we name branches?');
      });
      await act(async () => {
        model.last().options.onDelta('Ask your team.');
        model.last().finish();
        await Promise.resolve();
      });
      expect(result.current.messages.at(-1)).toMatchObject({
        text: 'Ask your team.',
        status: 'done',
        actions: [],
      });
      expect(todos.execute).not.toHaveBeenCalled();
    });
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
