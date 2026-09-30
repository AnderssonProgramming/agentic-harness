import { useLayoutEffect, useRef } from 'react';

// Layout effect so the jump happens before paint and the user never sees the old position.
export function useAutoScroll<T extends HTMLElement>(itemCount: number) {
  const containerRef = useRef<T>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container && itemCount > 0) {
      container.scrollTop = container.scrollHeight;
    }
  }, [itemCount]);

  return containerRef;
}
