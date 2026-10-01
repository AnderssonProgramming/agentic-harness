import { useRef, useState } from 'react';
import { canClear, type Message } from '../model/message';

interface NewConversationProps {
  messages: readonly Message[];
  onClear: () => void;
}

export function NewConversation({ messages, onClear }: NewConversationProps) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const clearable = canClear(messages);

  function cancel() {
    setConfirming(false);
    triggerRef.current?.focus();
  }

  function confirm() {
    setConfirming(false);
    if (canClear(messages)) onClear();
  }

  return (
    <div className="new-conversation">
      <button
        ref={triggerRef}
        type="button"
        className="new-conversation__button"
        disabled={!clearable}
        aria-expanded={confirming}
        onClick={() => {
          if (canClear(messages)) setConfirming(true);
        }}
      >
        New conversation
      </button>
      {confirming && (
        <div
          role="group"
          aria-labelledby="new-conversation-question"
          className="new-conversation__confirm"
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel();
          }}
        >
          <span id="new-conversation-question">Clear this conversation?</span>
          <button
            type="button"
            className="new-conversation__button new-conversation__button--danger"
            onClick={confirm}
          >
            Clear
          </button>
          <button type="button" className="new-conversation__button" autoFocus onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
