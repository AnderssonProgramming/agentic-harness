import '../chat.css';
import { TodoNotices } from '../../todos';
import { useAutoScroll } from '../hooks/use-auto-scroll';
import { useChat } from '../hooks/use-chat';
import { Composer } from './composer';
import { MessageList } from './message-list';
import { NewConversation } from './new-conversation';
import { StorageNotice } from './storage-notice';

export function ChatScreen() {
  const { messages, replying, storageNotice, engineActions, todosReset, send, stop, retry, clear } =
    useChat();
  const last = messages.at(-1);
  // Changes whenever the newest message grows or changes state, so a streaming reply stays in view.
  const contentKey = last ? `${last.id}:${String(last.text.length)}:${last.status}` : '';
  const scrollRef = useAutoScroll<HTMLDivElement>(messages.length, contentKey);

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
      <div className="chat__scroll" ref={scrollRef}>
        <MessageList messages={messages} onRetry={retry} />
      </div>
      <Composer onSend={send} onStop={stop} replying={replying} />
    </section>
  );
}
