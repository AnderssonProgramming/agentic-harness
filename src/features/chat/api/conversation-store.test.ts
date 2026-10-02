import { describe, expect, it } from 'vitest';
import type { Message } from '../model/message';
import { STORAGE_KEY, createConversationStore } from './conversation-store';

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
    clear: () => {
      items.clear();
    },
    ...overrides,
  };
}

const messages: readonly Message[] = [
  {
    id: 'id-1',
    author: 'user',
    text: 'Hi',
    createdAt: 1_000,
    status: 'done',
    error: null,
    actions: [],
  },
  {
    id: 'id-2',
    author: 'assistant',
    text: 'Hello',
    createdAt: 1_000,
    status: 'done',
    error: null,
    actions: [],
  },
];

describe('conversation store', () => {
  it('loads what it saved', () => {
    const storage = fakeStorage();
    const store = createConversationStore(() => storage);
    expect(store.load()).toEqual({ ok: true, conversation: { messages: [], outcome: 'empty' } });

    expect(store.save(messages)).toEqual({ ok: true });
    expect(store.load()).toEqual({ ok: true, conversation: { messages, outcome: 'restored' } });
  });

  it('reports blocked storage as unavailable instead of throwing', () => {
    const store = createConversationStore(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const unavailable = { ok: false, reason: 'unavailable' };
    expect(store.load()).toEqual(unavailable);
    expect(store.save(messages)).toEqual(unavailable);
    expect(store.clear()).toEqual(unavailable);
  });

  it('reports full storage when a save exceeds the quota', () => {
    const storage = fakeStorage({
      setItem: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
    });
    const store = createConversationStore(() => storage);
    expect(store.save(messages)).toEqual({ ok: false, reason: 'full' });
    expect(store.load()).toEqual({ ok: true, conversation: { messages: [], outcome: 'empty' } });
  });

  it('reports corrupted data once and removes it', () => {
    const storage = fakeStorage();
    storage.setItem(STORAGE_KEY, '{"version":1,"messages":[');
    const store = createConversationStore(() => storage);

    expect(store.load()).toEqual({ ok: true, conversation: { messages: [], outcome: 'reset' } });
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(store.load()).toEqual({ ok: true, conversation: { messages: [], outcome: 'empty' } });
  });

  it('clears the saved conversation', () => {
    const storage = fakeStorage();
    const store = createConversationStore(() => storage);
    store.save(messages);

    expect(store.clear()).toEqual({ ok: true });
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(store.load()).toEqual({ ok: true, conversation: { messages: [], outcome: 'empty' } });
  });
});
