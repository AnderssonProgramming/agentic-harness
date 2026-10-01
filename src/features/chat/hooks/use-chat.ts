import { useCallback, useEffect, useRef, useState } from 'react';
import { chatError, isChatError } from '../../../shared/llm/errors';
import { sendChat, type SendChat } from '../api/chat-api';
import {
  appendToReply,
  failReply,
  finishReply,
  historyBefore,
  isReplying,
  resetReply,
  startExchange,
  type Message,
  type MessageSource,
} from '../model/message';

const browserSource: MessageSource = {
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
};

export interface Chat {
  messages: readonly Message[];
  replying: boolean;
  /** Returns false when nothing was sent (invalid draft, or a reply is still streaming). */
  send: (draft: string) => boolean;
  stop: () => void;
  retry: (replyId: string) => void;
}

interface UseChatOptions {
  source?: MessageSource;
  send?: SendChat;
}

export function useChat({ source = browserSource, send = sendChat }: UseChatOptions = {}): Chat {
  const [messages, setMessages] = useState<readonly Message[]>([]);
  // The latest list, readable synchronously by send/retry between renders.
  const latest = useRef<readonly Message[]>([]);
  const inFlight = useRef<AbortController | null>(null);

  const update = useCallback((change: (current: readonly Message[]) => readonly Message[]) => {
    latest.current = change(latest.current);
    setMessages(latest.current);
  }, []);

  const streamReply = useCallback(
    async (replyId: string) => {
      const controller = new AbortController();
      inFlight.current = controller;
      try {
        await send(historyBefore(latest.current, replyId), {
          signal: controller.signal,
          onDelta: (text) => {
            update((current) => appendToReply(current, replyId, text));
          },
        });
        update((current) => finishReply(current, replyId));
      } catch (error) {
        const info = isChatError(error) ? error.info : chatError('unknown', String(error)).info;
        update((current) => failReply(current, replyId, info));
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [send, update],
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

  // Leaving the screen cancels a reply in progress, which also cancels it on the server.
  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );

  return { messages, replying: isReplying(messages), send: sendDraft, stop, retry };
}
