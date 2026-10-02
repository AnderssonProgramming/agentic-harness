import type { TodoAction } from './protocol.ts';

const clean = (text: string) =>
  text
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();

function sentenceAction(sentence: string): TodoAction | null {
  const text = clean(sentence);
  const add = /^remind me to (.+)$/i.exec(text) ?? /^add (.+) to my (?:to-?do )?list$/i.exec(text);
  if (add) return { kind: 'add', text: clean(add[1] ?? '') };
  if (/^what(?:'|’)?s on my (?:to-?do )?list$/i.test(text)) return { kind: 'list' };
  const complete = /^mark (.+) as done$/i.exec(text);
  if (complete) return { kind: 'complete', id: null, query: clean(complete[1] ?? '') };
  return null;
}

/**
 * The known to-do phrases (ADR-11): "remind me to …", "add … to my list", "what's on my list",
 * "mark … as done", one action per sentence or line that is one of them, in order. The mock turns
 * them into actions; for an engine without tool calling, the server and the browser use them to
 * refuse the message instead of letting the model answer.
 */
export function todoPhraseActions(message: string): TodoAction[] {
  return message
    .split(/\n+|(?<=[.!?])\s+/)
    .map(sentenceAction)
    .filter((action) => action !== null);
}

export function isTodoRequest(message: string): boolean {
  return todoPhraseActions(message).length > 0;
}
