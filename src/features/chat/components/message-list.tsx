import type { Message } from '../model/message';
import { STARTER_QUESTIONS } from '../model/starter-questions';
import { ReplyBody } from './reply-body';
import { StarterQuestions } from './starter-questions';

interface MessageListProps {
  messages: readonly Message[];
  onRetry: (replyId: string) => void;
  /** Sends a starter question from the empty state (B-10). */
  onAsk: (question: string) => void;
}

const authorLabel = { user: 'You', assistant: 'Compass' } as const;

export function MessageList({ messages, onRetry, onAsk }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <h2>Ask Compass anything about your new team</h2>
        <p>
          Pick a question to start, or type your own. Compass doesn&apos;t know your team&apos;s
          documents yet, and says so.
        </p>
        <StarterQuestions questions={STARTER_QUESTIONS} onPick={onAsk} />
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
