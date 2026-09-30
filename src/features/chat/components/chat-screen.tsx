import '../chat.css';
import { useAutoScroll } from '../hooks/use-auto-scroll';
import { useChat } from '../hooks/use-chat';
import { Composer } from './composer';
import { MessageList } from './message-list';

export function ChatScreen() {
  const { messages, send } = useChat();
  const scrollRef = useAutoScroll<HTMLDivElement>(messages.length);

  return (
    <section className="chat" aria-labelledby="chat-title">
      <h2 id="chat-title" className="visually-hidden">
        Chat
      </h2>
      <div className="chat__scroll" ref={scrollRef}>
        <MessageList messages={messages} />
      </div>
      <Composer onSend={send} />
    </section>
  );
}
