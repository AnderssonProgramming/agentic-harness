import { useCallback, useState } from 'react';
import { appendExchange, checkDraft, type Message, type MessageSource } from '../model/message';

const browserSource: MessageSource = {
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
};

export interface Chat {
  messages: readonly Message[];
  send: (draft: string) => boolean;
}

export function useChat(source: MessageSource = browserSource): Chat {
  const [messages, setMessages] = useState<readonly Message[]>([]);

  const send = useCallback(
    (draft: string) => {
      if (!checkDraft(draft).valid) return false;
      setMessages((previous) => appendExchange(previous, draft, source));
      return true;
    },
    [source],
  );

  return { messages, send };
}
