import type { Message } from '../model/message';

interface MessageListProps {
  messages: readonly Message[];
}

const authorLabel = { user: 'You', assistant: 'Compass' } as const;

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <h2>Ask Compass anything about your new team</h2>
        <p>
          Try &ldquo;How do we name branches?&rdquo; or &ldquo;Where do I start reading the
          code?&rdquo;. Replies are local for now; the model connection arrives in Sprint 2.
        </p>
      </div>
    );
  }

  return (
    <ol className="message-list" role="log" aria-live="polite" aria-label="Conversation">
      {messages.map((message) => (
        <li key={message.id} className={`message message--${message.author}`}>
          <span className="message__author">{authorLabel[message.author]}</span>
          <p className="message__text">{message.text}</p>
        </li>
      ))}
    </ol>
  );
}
