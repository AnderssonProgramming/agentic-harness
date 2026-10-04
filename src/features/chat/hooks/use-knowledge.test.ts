import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeDoc } from '../../../shared/llm/protocol';
import { useKnowledge } from './use-knowledge';

const LOADED: KnowledgeDoc[] = [{ source: 'branch-naming.md', title: 'Branch naming' }];
// Stable references, like the real api/ functions, so the list is fetched once.
const loadList = () => Promise.resolve(LOADED);

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useKnowledge (B-07)', () => {
  it('loads the list, then opens a known document: loading, then its text', async () => {
    const text = deferred<string | null>();
    const document = vi.fn(() => text.promise);
    const { result } = renderHook(() => useKnowledge({ list: loadList, document }));
    await waitFor(() => {
      expect(result.current.documents).toEqual(LOADED);
    });
    act(() => {
      result.current.open('branch-naming.md');
    });
    expect(result.current.opened).toEqual({
      source: 'branch-naming.md',
      title: 'Branch naming',
      state: 'loading',
      text: '',
    });
    await act(async () => {
      text.resolve('# Branch naming\n');
      await text.promise;
    });
    expect(result.current.opened).toMatchObject({ state: 'ready', text: '# Branch naming\n' });
    expect(document).toHaveBeenCalledWith('branch-naming.md');
  });

  it('never fetches a name that is not in the loaded list, nor before the list is known', async () => {
    const document = vi.fn(() => Promise.resolve('x'));
    const pending = deferred<readonly KnowledgeDoc[] | null>();
    const pendingList = () => pending.promise;
    const { result } = renderHook(() => useKnowledge({ list: pendingList, document }));
    act(() => {
      result.current.open('branch-naming.md');
    });
    await act(async () => {
      pending.resolve(LOADED);
      await pending.promise;
    });
    act(() => {
      result.current.open('invented-guide.md');
      result.current.open('../.env');
    });
    expect(document).not.toHaveBeenCalled();
    expect(result.current.opened).toBeNull();
  });

  it('shows an error state when the document cannot be read', async () => {
    const { result } = renderHook(() =>
      useKnowledge({ list: loadList, document: () => Promise.resolve(null) }),
    );
    await waitFor(() => {
      expect(result.current.documents).not.toBeNull();
    });
    await act(async () => {
      result.current.open('branch-naming.md');
      await Promise.resolve();
    });
    expect(result.current.opened).toMatchObject({ state: 'error', text: '' });
  });

  it('ignores a slow answer for a document closed in the meantime', async () => {
    const text = deferred<string | null>();
    const { result } = renderHook(() =>
      useKnowledge({ list: loadList, document: () => text.promise }),
    );
    await waitFor(() => {
      expect(result.current.documents).not.toBeNull();
    });
    act(() => {
      result.current.open('branch-naming.md');
      result.current.close();
    });
    await act(async () => {
      text.resolve('late');
      await text.promise;
    });
    expect(result.current.opened).toBeNull();
  });

  it('keeps documents null when the list is unavailable', async () => {
    const list = vi.fn(() => Promise.resolve(null));
    const { result } = renderHook(() => useKnowledge({ list }));
    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(result.current.documents).toBeNull();
  });
});
