import { describeChatError } from '../../../shared/llm/errors';
import type { KnowledgeDoc } from '../../../shared/llm/protocol';
import { TodoActionCard } from '../../todos';
import { classifySources, parseSources } from '../model/citations';
import type { Message } from '../model/message';
import { SourceChips } from './source-chips';

interface ReplyBodyProps {
  message: Message;
  /** Retry is only offered on the newest reply; older failures are history. */
  isLast: boolean;
  onRetry: (replyId: string) => void;
  /** The loaded documents a Sources line is checked against; null when unavailable (B-07). */
  documents: readonly KnowledgeDoc[] | null;
  onOpenSource: (source: string, chip: HTMLElement) => void;
}

export function ReplyBody({ message, isLast, onRetry, documents, onOpenSource }: ReplyBodyProps) {
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
  // Citations come from the stored text on every render, so nothing new is stored (ADR-14). A
  // streaming reply is shown as is: a half-received Sources line would flash wrong chips.
  const cited =
    message.status === 'streaming'
      ? { body: message.text, sources: [] }
      : parseSources(message.text);
  return (
    <>
      {cited.body !== '' && (
        <p className="message__text">
          {cited.body}
          {message.status === 'streaming' && <span className="caret" aria-hidden="true" />}
        </p>
      )}
      <SourceChips citations={classifySources(cited.sources, documents)} onOpen={onOpenSource} />
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
