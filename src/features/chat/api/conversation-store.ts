import {
  restoreSnapshot,
  toSnapshot,
  type RestoredConversation,
} from '../model/conversation-snapshot';
import type { Message } from '../model/message';

export const STORAGE_KEY = 'compass.conversation';

export type StorageFailure = 'unavailable' | 'full';

export type StoreResult = { ok: true } | { ok: false; reason: StorageFailure };

export type LoadResult =
  { ok: true; conversation: RestoredConversation } | { ok: false; reason: StorageFailure };

export interface ConversationStore {
  load: () => LoadResult;
  save: (messages: readonly Message[]) => StoreResult;
  clear: () => StoreResult;
}

// Browsers name a full storage differently; anything else (e.g. SecurityError when storage is
// blocked) means it can't be used at all.
function toFailure(error: unknown): { ok: false; reason: StorageFailure } {
  const name = error instanceof DOMException ? error.name : '';
  const full = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
  return { ok: false, reason: full ? 'full' : 'unavailable' };
}

/**
 * The chat's only access to storage (ADR-07). Synchronous, so `useChat` can restore in its first
 * render. Never throws: every storage exception becomes a failure result.
 */
export function createConversationStore(getStorage: () => Storage): ConversationStore {
  return {
    load: () => {
      try {
        const storage = getStorage();
        const conversation = restoreSnapshot(storage.getItem(STORAGE_KEY));
        // Unreadable data is dropped so the "couldn't restore" notice appears only once.
        if (conversation.outcome === 'reset') storage.removeItem(STORAGE_KEY);
        return { ok: true, conversation };
      } catch (error) {
        return toFailure(error);
      }
    },
    save: (messages) => {
      try {
        getStorage().setItem(STORAGE_KEY, toSnapshot(messages));
        return { ok: true };
      } catch (error) {
        return toFailure(error);
      }
    },
    clear: () => {
      try {
        getStorage().removeItem(STORAGE_KEY);
        return { ok: true };
      } catch (error) {
        return toFailure(error);
      }
    },
  };
}

export const conversationStore = createConversationStore(() => window.localStorage);
