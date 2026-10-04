import type { KnowledgeDoc } from '../../../shared/llm/protocol';
import type { Message } from '../model/message';
import { STARTER_QUESTIONS } from '../model/starter-questions';
import { ReplyBody } from './reply-body';
import { StarterQuestions } from './starter-questions';

interface MessageListProps {
  messages: readonly Message[];
  onRetry: (replyId: string) => void;
  /** Sends a starter question from the empty state (B-10). */
  onAsk: (question: string) => void;
  /** The loaded documents replies' Sources lines are checked against (B-07). */
  documents: readonly KnowledgeDoc[] | null;
  onOpenSource: (source: string, chip: HTMLElement) => void;
}

const authorLabel = { user: 'You', assistant: 'Compass' } as const;

export function MessageList({
  messages,
  onRetry,
  onAsk,
  documents,
  onOpenSource,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <h2>Ask Compass anything about your new team</h2>
        <p>
          Pick a question to start, or type your own. Answers from your team&apos;s documents name
          their source, and Compass says so when the documents don&apos;t cover something.
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
            <ReplyBody
              message={message}
              isLast={index === messages.length - 1}
              onRetry={onRetry}
              documents={documents}
              onOpenSource={onOpenSource}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
