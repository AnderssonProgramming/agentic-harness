import { describeChatError } from '../../../shared/llm/errors';
import { TodoActionCard } from '../../todos';
import type { Message } from '../model/message';

interface ReplyBodyProps {
  message: Message;
  /** Retry is only offered on the newest reply; older failures are history. */
  isLast: boolean;
  onRetry: (replyId: string) => void;
}

export function ReplyBody({ message, isLast, onRetry }: ReplyBodyProps) {
  // To-do actions replace the reply's text with the app's cards, one per action (B-11, ADR-11).
  if (message.actions.length > 0) {
    return (
      <>
        {message.actions.map((action, index) => (
          // Actions are only ever appended, so the position is a stable key and a pending card
          // stays the same element when it settles.
          <TodoActionCard key={index} state={action} />
        ))}
      </>
    );
  }
  if (message.status === 'streaming' && message.text === '') {
    return (
      <p className="message__text">
        <span className="typing" role="status" aria-label="Compass is typing">
          <span />
          <span />
          <span />
        </span>
      </p>
    );
  }
  return (
    <>
      {message.text !== '' && (
        <p className="message__text">
          {message.text}
          {message.status === 'streaming' && <span className="caret" aria-hidden="true" />}
        </p>
      )}
      {message.status === 'stopped' && <span className="message__note">Stopped</span>}
      {message.status === 'error' && message.error && (
        <div className="message__error" role="alert">
          <p>{describeChatError(message.error)}</p>
          {message.error.retryable && isLast && (
            <button
              type="button"
              className="message__retry"
              onClick={() => {
                onRetry(message.id);
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </>
  );
}
