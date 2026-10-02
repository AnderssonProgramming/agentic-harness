import '../todos.css';

const NO_ACTIONS_NOTICE =
  "Compass can't change your to-do list with the current engine. Your saved to-dos are safe.";
const RESET_NOTICE = "Your saved to-do list couldn't be read, so it was reset.";

interface TodoNoticesProps {
  /** False while the active engine can't run to-do actions; null while it's unknown. */
  actionsAvailable: boolean | null;
  /** Unreadable to-do data was found and removed when Compass opened. */
  reset: boolean;
}

/** The app's standing notices about the to-do list (B-11, ADR-11 Amendment 1). */
export function TodoNotices({ actionsAvailable, reset }: TodoNoticesProps) {
  const engine = actionsAvailable === false;
  // The live regions stay mounted so screen readers announce the text when it appears.
  return (
    <>
      <p role="status" className={engine ? 'todo-notice' : 'visually-hidden'} data-notice="engine">
        {engine ? NO_ACTIONS_NOTICE : ''}
      </p>
      <p role="status" className={reset ? 'todo-notice' : 'visually-hidden'} data-notice="reset">
        {reset ? RESET_NOTICE : ''}
      </p>
    </>
  );
}
