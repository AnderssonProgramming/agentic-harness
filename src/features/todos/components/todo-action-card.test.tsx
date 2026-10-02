import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TodoActionCard } from './todo-action-card';

const view = { id: 't1', text: 'ask Ana how deploys work', done: false };

describe('TodoActionCard (B-11)', () => {
  it('shows a pending state, then turns into the result on the same element', () => {
    const { container, rerender } = render(
      <TodoActionCard state={{ status: 'pending', request: { kind: 'add', text: 'x' } }} />,
    );
    const card = container.firstElementChild;
    expect(card).toHaveClass('todo-card--pending');
    expect(screen.getByRole('status')).toHaveTextContent('Updating your list…');

    rerender(<TodoActionCard state={{ status: 'settled', card: { kind: 'added', todo: view } }} />);
    expect(container.firstElementChild).toBe(card);
    expect(card).toHaveClass('todo-card--success');
    expect(card).not.toHaveClass('todo-card--pending');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Added to your list: ask Ana how deploys work',
    );
  });

  it('lists the stored to-dos with the done ones marked', () => {
    render(
      <TodoActionCard
        state={{
          status: 'settled',
          card: { kind: 'listed', todos: [view, { id: 't2', text: 'read the guide', done: true }] },
        }}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'ask Ana how deploys work',
      'Done: read the guide',
    ]);
    expect(items[1]).toHaveClass('todo-card__item--done');
  });

  it('announces a failure as an alert', () => {
    render(
      <TodoActionCard
        state={{
          status: 'settled',
          card: { kind: 'failed', action: 'add', reason: 'unavailable' },
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save to your list");
  });

  it('shows an over-long to-do as a failure that says it is too long (F-02)', () => {
    render(
      <TodoActionCard
        state={{ status: 'settled', card: { kind: 'failed', action: 'add', reason: 'too-long' } }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't save to your list: the to-do is too long (more than 200 characters). Nothing was changed.",
    );
  });

  it('says a refused request was not done, and why (Amendment 1)', () => {
    render(
      <TodoActionCard
        state={{ status: 'settled', card: { kind: 'unsupported', action: 'add' } }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Not added: the current engine can't run to-do actions, so Compass didn't touch your list.",
    );
  });
});
