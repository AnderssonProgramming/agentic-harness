import { useRef } from 'react';
import '../chat.css';
import { TodoNotices } from '../../todos';
import { useAutoScroll } from '../hooks/use-auto-scroll';
import { useChat } from '../hooks/use-chat';
import { useKnowledge } from '../hooks/use-knowledge';
import { Composer } from './composer';
import { MessageList } from './message-list';
import { NewConversation } from './new-conversation';
import { SourcePanel } from './source-panel';
import { StorageNotice } from './storage-notice';

export function ChatScreen() {
  const { messages, replying, storageNotice, engineActions, todosReset, send, stop, retry, clear } =
    useChat();
  const knowledge = useKnowledge();
  // The chip that opened the side panel, so focus returns to it on close (B-07).
  const openerRef = useRef<HTMLElement | null>(null);
  const last = messages.at(-1);
  // Changes whenever the newest message grows or changes state, so a streaming reply stays in view.
  const contentKey = last ? `${last.id}:${String(last.text.length)}:${last.status}` : '';
  const scrollRef = useAutoScroll<HTMLDivElement>(messages.length, contentKey);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A starter question goes through the same send as the composer; the clicked button
  // disappears with the empty state, so focus moves to the input instead of being lost.
  function ask(question: string) {
    send(question);
    inputRef.current?.focus();
  }

  function openSource(source: string, chip: HTMLElement) {
    openerRef.current = chip;
    knowledge.open(source);
  }

  function closeSource() {
    knowledge.close();
    openerRef.current?.focus();
    openerRef.current = null;
  }

  return (
    <section className="chat" aria-labelledby="chat-title">
      <h2 id="chat-title" className="visually-hidden">
        Chat
      </h2>
      <div className="chat__toolbar">
        <NewConversation messages={messages} onClear={clear} />
      </div>
      <StorageNotice notice={storageNotice} />
      <TodoNotices actionsAvailable={engineActions} reset={todosReset} />
      <div className="chat__main">
        <div className="chat__scroll" ref={scrollRef}>
          <MessageList
            messages={messages}
            onRetry={retry}
            onAsk={ask}
            documents={knowledge.documents}
            onOpenSource={openSource}
          />
        </div>
        {knowledge.opened && <SourcePanel document={knowledge.opened} onClose={closeSource} />}
      </div>
      <Composer onSend={send} onStop={stop} replying={replying} inputRef={inputRef} />
    </section>
  );
}
