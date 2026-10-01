import type { Message } from '../model/message';
import { ReplyBody } from './reply-body';

interface MessageListProps {
  messages: readonly Message[];
  onRetry: (replyId: string) => void;
}

const authorLabel = { user: 'You', assistant: 'Compass' } as const;

export function MessageList({ messages, onRetry }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <h2>Ask Compass anything about your new team</h2>
        <p>
          Try &ldquo;What should I learn first in a React codebase?&rdquo; or &ldquo;How do I ask
          for a code review?&rdquo;. Compass doesn&apos;t know your team&apos;s documents yet, and
          says so.
        </p>
      </div>
    );
  }

  return (
    <ol
      className="message-list"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
      aria-busy={messages.some((message) => message.status === 'streaming')}
    >
      {messages.map((message, index) => (
        <li
          key={message.id}
          className={`message message--${message.author} message--${message.status}`}
        >
          <span className="message__author">{authorLabel[message.author]}</span>
          {message.author === 'user' ? (
            <p className="message__text">{message.text}</p>
          ) : (
            <ReplyBody message={message} isLast={index === messages.length - 1} onRetry={onRetry} />
          )}
        </li>
      ))}
    </ol>
  );
}
