import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRoute } from './use-route';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useRoute', () => {
  it('reads the current path', () => {
    window.history.replaceState(null, '', '/knowledge');
    const { result } = renderHook(() => useRoute());
    expect(result.current.path).toBe('/knowledge');
  });

  it('navigate() updates the URL and the path, adding a history entry', () => {
    const { result } = renderHook(() => useRoute());
    const before = window.history.length;

    act(() => {
      result.current.navigate('/settings');
    });

    expect(window.location.pathname).toBe('/settings');
    expect(result.current.path).toBe('/settings');
    expect(window.history.length).toBe(before + 1);
  });

  it('does not add a history entry when navigating to the current path', () => {
    const { result } = renderHook(() => useRoute());
    const before = window.history.length;
    act(() => {
      result.current.navigate('/');
    });
    expect(window.history.length).toBe(before);
  });

  it('follows the browser back button (popstate)', () => {
    const { result } = renderHook(() => useRoute());
    act(() => {
      window.history.pushState(null, '', '/elsewhere');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.path).toBe('/elsewhere');
  });
});
