import { describe, expect, it } from 'vitest';
import { isTodoRequest, todoPhraseActions } from './todo-phrases.ts';

describe('todoPhraseActions (B-11)', () => {
  it.each([
    ['Remind me to ask Ana how deploys work', { kind: 'add', text: 'ask Ana how deploys work' }],
    ['remind me to read the style guide!', { kind: 'add', text: 'read the style guide' }],
    ['Add set up the VPN to my list', { kind: 'add', text: 'set up the VPN' }],
    ['add pair with Bo to my to-do list.', { kind: 'add', text: 'pair with Bo' }],
    ["What's on my list?", { kind: 'list' }],
    ['whats on my todo list', { kind: 'list' }],
    ['Mark the deploy one as done', { kind: 'complete', id: null, query: 'the deploy one' }],
  ])('maps "%s"', (message, action) => {
    expect(todoPhraseActions(message)).toEqual([action]);
  });

  it.each([
    'How do we name branches?',
    'Can you remind me how deploys work?',
    'What is on the menu?',
    'Mark my words',
  ])('leaves "%s" as an ordinary message', (message) => {
    expect(todoPhraseActions(message)).toEqual([]);
    expect(isTodoRequest(message)).toBe(false);
  });

  it('returns one action per to-do sentence or line, in order', () => {
    expect(
      todoPhraseActions(
        'Remind me to read the guide. Remind me to ask Bo!\nMark the VPN one as done',
      ),
    ).toEqual([
      { kind: 'add', text: 'read the guide' },
      { kind: 'add', text: 'ask Bo' },
      { kind: 'complete', id: null, query: 'the VPN one' },
    ]);
  });

  it('keeps a dot that is not a sentence end, and finds a phrase after an earlier paragraph', () => {
    expect(todoPhraseActions('Remind me to check the v1.2 notes')).toEqual([
      { kind: 'add', text: 'check the v1.2 notes' },
    ]);
    expect(isTodoRequest('Hello there\n\nRemind me to ask Ana')).toBe(true);
  });
});
