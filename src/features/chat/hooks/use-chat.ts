import { useCallback, useEffect, useRef, useState } from 'react';
import { chatError, isChatError } from '../../../shared/llm/errors';
import type { TodoAction } from '../../../shared/llm/protocol';
import { todoPhraseActions } from '../../../shared/llm/todo-phrases';
import { todoActions as defaultTodoActions, unsupportedCard, type TodoActions } from '../../todos';
import { getEngineInfo, sendChat, type GetEngineInfo, type SendChat } from '../api/chat-api';
import {
  conversationStore,
  type ConversationStore,
  type StorageFailure,
  type StoreResult,
} from '../api/conversation-store';
import {
  appendToReply,
  canClear,
  failReply,
  finishReply,
  historyBefore,
  isReplying,
  lastUserTurn,
  resetReply,
  settleActions,
  startAction,
  startExchange,
  type Message,
  type MessageSource,
} from '../model/message';

const browserSource: MessageSource = {
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
};

/** Streamed text is saved at most this often; every status change is saved at once (B-08). */
export const TEXT_SAVE_INTERVAL_MS = 1_000;

/** Why the conversation isn't being saved, or `reset` when a stored one couldn't be restored. */
export type StorageNotice = StorageFailure | 'reset';

export interface Chat {
  messages: readonly Message[];
  replying: boolean;
  storageNotice: StorageNotice | null;
  /** Whether the active engine can run to-do actions; null until known (ADR-11). */
  engineActions: boolean | null;
  /** The stored to-do list was unreadable when Compass opened and has been reset. */
  todosReset: boolean;
  /** Returns false when nothing was sent (invalid draft, or a reply is still streaming). */
  send: (draft: string) => boolean;
  stop: () => void;
  retry: (replyId: string) => void;
  /** Stops any reply in progress, then empties the conversation on screen and in storage. */
  clear: () => void;
}

interface UseChatOptions {
  source?: MessageSource;
  send?: SendChat;
  store?: ConversationStore;
  todos?: TodoActions;
  engineInfo?: GetEngineInfo;
}

interface Restored {
  messages: readonly Message[];
  notice: StorageNotice | null;
  todosReset: boolean;
}

function restore(store: ConversationStore, todos: TodoActions): Restored {
  const { reset: todosReset } = todos.restore();
  const loaded = store.load();
  if (!loaded.ok) return { messages: [], notice: loaded.reason, todosReset };
  const { messages, outcome } = loaded.conversation;
  return { messages, notice: outcome === 'reset' ? 'reset' : null, todosReset };
}

export function useChat({
  source = browserSource,
  send = sendChat,
  store = conversationStore,
  todos = defaultTodoActions,
  engineInfo = getEngineInfo,
}: UseChatOptions = {}): Chat {
  // Restoring inside the initializer avoids an empty first render (B-08).
  const [initial] = useState(() => restore(store, todos));
  const [messages, setMessages] = useState(initial.messages);
  const [storageNotice, setStorageNotice] = useState(initial.notice);
  const [todosReset, setTodosReset] = useState(initial.todosReset);
  const [engineActions, setEngineActions] = useState<boolean | null>(null);
  // The latest list, readable synchronously by send/retry between renders.
  const latest = useRef(initial.messages);
  const inFlight = useRef<AbortController | null>(null);
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const report = useCallback((result: StoreResult) => {
    if (!result.ok) setStorageNotice(result.reason);
    else setStorageNotice((notice) => (notice === 'reset' ? notice : null));
  }, []);

  const saveNow = useCallback(() => {
    if (pendingSave.current !== null) clearTimeout(pendingSave.current);
    pendingSave.current = null;
    report(latest.current.length === 0 ? store.clear() : store.save(latest.current));
  }, [report, store]);

  const saveSoon = useCallback(() => {
    pendingSave.current ??= setTimeout(saveNow, TEXT_SAVE_INTERVAL_MS);
  }, [saveNow]);

  const update = useCallback(
    (change: (current: readonly Message[]) => readonly Message[], save: () => void = saveNow) => {
      latest.current = change(latest.current);
      setMessages(latest.current);
      save();
    },
    [saveNow],
  );

  const streamReply = useCallback(
    async (replyId: string) => {
      const controller = new AbortController();
      inFlight.current = controller;
      const history = historyBefore(latest.current, replyId);
      const requested: TodoAction[] = [];
      // Set by onStart; an object so the type checker sees it can change inside the callback.
      const engine = { canAct: true };
      try {
        await send(history, {
          signal: controller.signal,
          todos: todos.openRefs(),
          onStart: (info) => {
            engine.canAct = info.actions;
            setEngineActions(info.actions);
          },
          onDelta: (text) => {
            update((current) => appendToReply(current, replyId, text), saveSoon);
          },
          onAction: (action) => {
            requested.push(action);
            update((current) => startAction(current, replyId, action));
          },
        });
        // An engine without tool calling never sees a to-do request (the server holds it back):
        // the app says it wasn't done, and storage is never touched (ADR-11, Amendment 1).
        const refused = engine.canAct ? [] : todoPhraseActions(lastUserTurn(history));
        if (refused.length > 0) {
          update((current) => settleActions(current, replyId, refused.map(unsupportedCard)));
        } else if (requested.length > 0) {
          // Runs only once the reply is complete, so a failed or stopped reply changes nothing.
          // In order, each on what the previous one stored, each with its own card.
          const cards = requested.map((action) => todos.execute(action));
          update((current) => settleActions(current, replyId, cards));
        } else {
          update((current) => finishReply(current, replyId));
        }
      } catch (error) {
        const info = isChatError(error) ? error.info : chatError('unknown', String(error)).info;
        update((current) => failReply(current, replyId, info));
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [saveSoon, send, todos, update],
  );

  const sendDraft = useCallback(
    (draft: string) => {
      const started = startExchange(latest.current, draft, source);
      if (!started) return false;
      update(() => started.messages);
      void streamReply(started.replyId);
      return true;
    },
    [source, streamReply, update],
  );

  const stop = useCallback(() => {
    inFlight.current?.abort();
  }, []);

  const retry = useCallback(
    (replyId: string) => {
      const reply = latest.current.find((message) => message.id === replyId);
      if (reply?.status !== 'error' || isReplying(latest.current)) return;
      update((current) => resetReply(current, replyId));
      void streamReply(replyId);
    },
    [streamReply, update],
  );

  const clear = useCallback(() => {
    if (!canClear(latest.current)) return;
    inFlight.current?.abort();
    setStorageNotice(null);
    setTodosReset(false);
    update(() => []);
  }, [update]);

  // Shows the engine notice before the first message; every reply's start keeps it current.
  useEffect(() => {
    let active = true;
    void engineInfo().then((info) => {
      if (active && info) setEngineActions((known) => known ?? info.actions);
    });
    return () => {
      active = false;
    };
  }, [engineInfo]);

  // The page can be closed between two throttled saves of streamed text.
  useEffect(() => {
    const flush = () => {
      if (pendingSave.current !== null) saveNow();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [saveNow]);

  // Leaving the screen cancels a reply in progress, which also cancels it on the server.
  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );

  return {
    messages,
    replying: isReplying(messages),
    storageNotice,
    engineActions,
    todosReset,
    send: sendDraft,
    stop,
    retry,
    clear,
  };
}
