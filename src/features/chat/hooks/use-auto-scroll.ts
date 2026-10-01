import { useEffect, useLayoutEffect, useRef } from 'react';

// Within this many pixels of the bottom counts as "reading the latest message".
const STICK_THRESHOLD_PX = 80;

/**
 * Keeps the newest message in view. A new message always scrolls to the bottom. Text that grows
 * inside the last message (a streaming reply) only follows if the user was already at the bottom,
 * so scrolling up to reread something isn't interrupted.
 */
export function useAutoScroll<T extends HTMLElement>(itemCount: number, contentKey: string) {
  const containerRef = useRef<T>(null);
  const stuckToBottom = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      stuckToBottom.current = distance <= STICK_THRESHOLD_PX;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Layout effects so the jump happens before paint and the old position is never visible.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container && itemCount > 0) {
      container.scrollTop = container.scrollHeight;
      stuckToBottom.current = true;
    }
  }, [itemCount]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container && stuckToBottom.current) container.scrollTop = container.scrollHeight;
  }, [contentKey]);

  return containerRef;
}
