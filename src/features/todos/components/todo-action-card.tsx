import '../todos.css';
import { cardTitle, type TodoActionState, type TodoCard } from '../model/todo';

interface TodoActionCardProps {
  state: TodoActionState;
}

type Tone = 'pending' | 'success' | 'question' | 'failure';

function toneOf(card: TodoCard): Tone {
  if (card.kind === 'failed' || card.kind === 'unsupported') return 'failure';
  if (card.kind === 'no-match' || card.kind === 'ambiguous') return 'question';
  return 'success';
}

/** The app's confirmation of a to-do action (ADR-11). The same element moves from pending to its result. */
export function TodoActionCard({ state }: TodoActionCardProps) {
  const tone = state.status === 'pending' ? 'pending' : toneOf(state.card);
  const items =
    state.status === 'pending'
      ? []
      : state.card.kind === 'listed'
        ? state.card.todos
        : state.card.kind === 'ambiguous'
          ? state.card.candidates
          : [];

  return (
    <div
      className={`todo-card todo-card--${tone}`}
      role={tone === 'failure' ? 'alert' : 'status'}
      data-card={state.status === 'pending' ? 'pending' : state.card.kind}
    >
      <p className="todo-card__title">
        {state.status === 'pending' ? 'Updating your list…' : cardTitle(state.card)}
      </p>
      {items.length > 0 && (
        <ul className="todo-card__items">
          {items.map((todo) => (
            <li
              key={todo.id}
              className={`todo-card__item${todo.done ? ' todo-card__item--done' : ''}`}
              data-id={todo.id}
            >
              {todo.done && <span className="todo-card__done">Done: </span>}
              {todo.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
