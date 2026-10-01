/**
 * An in-memory Storage for tests of the to-do store and actions. Pass the same `items` to two
 * fakes to get two views of one storage, e.g. one whose writes fail.
 */
export function fakeStorage(
  overrides: Partial<Storage> = {},
  items = new Map<string, string>(),
): Storage {
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
