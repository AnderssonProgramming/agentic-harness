import type { TodoAction, TodoRef } from '../../src/shared/llm/protocol.ts';
import { isRecord } from './errors.ts';

/** The to-do tools for engines with tool calling (ADR-11), in the Anthropic Messages API format. */
export const TODO_TOOLS = [
  {
    name: 'add_todo',
    description:
      "Add one item to the user's onboarding to-do list. Use it when the user asks to be reminded of something or to add something to their list.",
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The to-do, short, in the words of the user.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'list_todos',
    description:
      "Show the user's to-do list. Use it whenever the user asks what is on their list or what is pending; the app shows the stored list.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'complete_todo',
    description:
      'Mark one open to-do as done. Pass the id of the open to-do the user means when you are sure which one it is, and always a short description of it.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The id of an open to-do from the list you were given.',
        },
        description: { type: 'string', description: 'What the user called the to-do.' },
      },
      required: ['description'],
    },
  },
] as const;

/** Appended to the system prompt of engines that declare the tools. */
export function todoContext(todos: readonly TodoRef[]): string {
  const list =
    todos.length === 0
      ? 'The user has no open to-dos.'
      : `The user's open to-dos (id: text):\n${todos.map((t) => `- ${t.id}: ${t.text}`).join('\n')}`;
  return `${list}\nUse the to-do tools to add, list or complete to-dos, one tool call per reply. Never answer what is on the list from memory: call list_todos.`;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Turns a tool call into an action, or null when the tool or its input isn't valid. */
export function actionFromToolUse(name: string, input: unknown): TodoAction | null {
  const fields = isRecord(input) ? input : {};
  switch (name) {
    case 'add_todo': {
      const added = text(fields.text);
      return added === '' ? null : { kind: 'add', text: added };
    }
    case 'list_todos':
      return { kind: 'list' };
    case 'complete_todo': {
      const id = text(fields.id);
      const query = text(fields.description);
      return id === '' && query === ''
        ? null
        : { kind: 'complete', id: id === '' ? null : id, query };
    }
    default:
      return null;
  }
}
