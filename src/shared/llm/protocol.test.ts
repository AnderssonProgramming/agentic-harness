// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isStreamEvent, isTodoAction } from './protocol.ts';

describe('isTodoAction (B-11)', () => {
  it.each([
    [{ kind: 'add', text: 'ask Ana how deploys work' }],
    [{ kind: 'list' }],
    [{ kind: 'complete', id: null, query: 'the deploy one' }],
    [{ kind: 'complete', id: 't1', query: '' }],
  ])('accepts %j', (action) => {
    expect(isTodoAction(action)).toBe(true);
  });

  it.each([
    [{ kind: 'add', text: '   ' }],
    [{ kind: 'add' }],
    [{ kind: 'complete', id: null, query: '' }],
    [{ kind: 'complete', query: 'x' }],
    [{ kind: 'delete', id: 't1' }],
    [null],
  ])('rejects %j', (action) => {
    expect(isTodoAction(action)).toBe(false);
  });

  it('validates the action inside an action event', () => {
    expect(isStreamEvent({ type: 'action', action: { kind: 'list' } })).toBe(true);
    expect(isStreamEvent({ type: 'action', action: { kind: 'list!' } })).toBe(false);
  });
});
