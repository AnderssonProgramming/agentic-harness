import { describe, expect, it } from 'vitest';
import {
  addTodo,
  cardSummary,
  cardTitle,
  completeTodo,
  listOrder,
  matchOpenTodos,
  openRefs,
  type Todo,
  type TodoCard,
} from './todo';

const todo = (id: string, text: string, done = false): Todo => ({
  id,
  text,
  done,
  createdAt: 1,
  doneAt: done ? 2 : null,
});

const deploy = todo('t1', 'ask Ana how deploys work');
const styleGuide = todo('t2', 'read the style guide');
const oldDeploy = todo('t3', 'watch the deploy demo', true);
const list = [deploy, oldDeploy, styleGuide];

describe('to-do model (B-11)', () => {
  it('adds an open to-do with a new id and trimmed text', () => {
    const source = { newId: () => 'new', now: () => 5 };
    const { todos, added } = addTodo([deploy], '  set up the VPN ', source);
    expect(added).toEqual({
      id: 'new',
      text: 'set up the VPN',
      done: false,
      createdAt: 5,
      doneAt: null,
    });
    expect(todos).toEqual([deploy, added]);
  });

  it('completes only the to-do with that id', () => {
    expect(completeTodo(list, 't1', 9)).toEqual([
      { ...deploy, done: true, doneAt: 9 },
      oldDeploy,
      styleGuide,
    ]);
  });

  it('lists open to-dos first, then done ones, keeping the order they were added', () => {
    expect(listOrder(list).map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(openRefs(list)).toEqual([
      { id: 't1', text: 'ask Ana how deploys work' },
      { id: 't2', text: 'read the style guide' },
    ]);
  });

  describe('matchOpenTodos', () => {
    it('matches "the deploy one" by keyword, ignoring done to-dos', () => {
      expect(matchOpenTodos(list, { id: null, query: 'the deploy one' })).toEqual([deploy]);
    });

    it("uses the model's id when it names an open to-do", () => {
      expect(matchOpenTodos(list, { id: 't2', query: 'the deploy one' })).toEqual([styleGuide]);
    });

    it('ignores an id that is unknown or done, and falls back to the query', () => {
      expect(matchOpenTodos(list, { id: 't3', query: 'style' })).toEqual([styleGuide]);
      expect(matchOpenTodos(list, { id: 'nope', query: '' })).toEqual([]);
    });

    it('prefers an exact text match', () => {
      const both = [...list, todo('t4', 'ask Ana how deploys work in staging')];
      expect(matchOpenTodos(both, { id: null, query: 'Ask Ana how deploys work' })).toEqual([
        deploy,
      ]);
    });

    it('returns every candidate when several match, and none when nothing does', () => {
      const two = [...list, todo('t4', 'read the deploy checklist')];
      expect(matchOpenTodos(two, { id: null, query: 'the deploy one' }).map((t) => t.id)).toEqual([
        't1',
        't4',
      ]);
      expect(matchOpenTodos(list, { id: null, query: 'the coffee one' })).toEqual([]);
      expect(matchOpenTodos(list, { id: null, query: 'that one' })).toEqual([]);
    });
  });

  describe('card wording', () => {
    const view = { id: 't1', text: 'ask Ana how deploys work', done: false };

    it.each<[TodoCard, string]>([
      [{ kind: 'added', todo: view }, 'Added to your list: ask Ana how deploys work'],
      [
        { kind: 'completed', todo: { ...view, done: true } },
        'Marked as done: ask Ana how deploys work',
      ],
      [{ kind: 'listed', todos: [] }, 'Your list is empty.'],
      [
        { kind: 'listed', todos: [view, { ...view, id: 't2', done: true }] },
        'Your list has 2 to-dos, 1 open:',
      ],
      [
        { kind: 'no-match', query: 'the coffee one' },
        'No open to-do matches “the coffee one”. Which one do you mean?',
      ],
      [
        { kind: 'ambiguous', query: 'deploy', candidates: [view] },
        'More than one open to-do matches “deploy”. Which one do you mean?',
      ],
      [
        { kind: 'failed', action: 'add', reason: 'full' },
        "Couldn't save to your list: your browser's storage is full. Nothing was changed.",
      ],
      [
        { kind: 'failed', action: 'list', reason: 'unavailable' },
        "Couldn't read your list: your browser is blocking storage.",
      ],
    ])('titles %j', (card, title) => {
      expect(cardTitle(card)).toBe(title);
    });

    it('summarises a card, with its items, for the model', () => {
      expect(
        cardSummary({
          kind: 'listed',
          todos: [view, { ...view, id: 't2', text: 'x', done: true }],
        }),
      ).toBe(
        "[The app's to-do list] Your list has 2 to-dos, 1 open:\n- ask Ana how deploys work\n- x (done)",
      );
    });
  });
});
