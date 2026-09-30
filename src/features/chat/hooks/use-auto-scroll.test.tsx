import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAutoScroll } from './use-auto-scroll';

function Scroller({ count }: { count: number }) {
  const ref = useAutoScroll<HTMLDivElement>(count);
  return <div ref={ref} data-testid="scroller" />;
}

function withScrollHeight(element: HTMLElement, height: number) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: height });
}

describe('useAutoScroll', () => {
  it('scrolls to the bottom whenever the item count grows', () => {
    const { getByTestId, rerender } = render(<Scroller count={0} />);
    const scroller = getByTestId('scroller');

    withScrollHeight(scroller, 500);
    rerender(<Scroller count={2} />);
    expect(scroller.scrollTop).toBe(500);

    withScrollHeight(scroller, 900);
    rerender(<Scroller count={4} />);
    expect(scroller.scrollTop).toBe(900);
  });
});
