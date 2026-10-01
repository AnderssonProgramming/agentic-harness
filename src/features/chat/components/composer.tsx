import { useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { MAX_MESSAGE_LENGTH, checkDraft } from '../model/message';

interface ComposerProps {
  onSend: (draft: string) => boolean;
  onStop: () => void;
  /** While a reply streams, sending is blocked and Send becomes Stop; typing the next draft still works. */
  replying: boolean;
}

export function Composer({ onSend, onStop, replying }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const check = checkDraft(draft);
  const tooLong = !check.valid && check.reason === 'too-long';

  function submit() {
    if (!replying && check.valid && onSend(draft)) setDraft('');
    inputRef.current?.focus();
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: don't send while an IME (e.g. accented or Asian input) is mid-composition.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <label htmlFor="composer-input" className="visually-hidden">
        Message
      </label>
      <textarea
        id="composer-input"
        ref={inputRef}
        className="composer__input"
        value={draft}
        rows={2}
        placeholder="Ask about the codebase or team conventions…"
        aria-describedby="composer-counter"
        aria-invalid={tooLong}
        autoFocus
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={handleKeyDown}
      />
      <div className="composer__footer">
        <span
          id="composer-counter"
          className={tooLong ? 'composer__counter composer__counter--over' : 'composer__counter'}
        >
          {replying ? 'Compass is replying… ' : ''}
          {tooLong ? 'Too long: ' : ''}
          {draft.trim().length} / {MAX_MESSAGE_LENGTH}
        </span>
        {replying ? (
          <button
            type="button"
            className="composer__send composer__send--stop"
            onClick={() => {
              onStop();
              inputRef.current?.focus();
            }}
          >
            Stop
          </button>
        ) : (
          <button type="submit" className="composer__send" disabled={!check.valid}>
            Send
          </button>
        )}
      </div>
    </form>
  );
}
