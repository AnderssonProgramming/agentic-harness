import { useSyncExternalStore } from 'react';

// pushState doesn't fire popstate, so navigate() announces changes with its own event.
const NAVIGATE_EVENT = 'compass:navigate';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

function currentPath() {
  return window.location.pathname;
}

export function navigate(path: string) {
  if (path === window.location.pathname) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function useRoute() {
  const path = useSyncExternalStore(subscribe, currentPath);
  return { path, navigate };
}
