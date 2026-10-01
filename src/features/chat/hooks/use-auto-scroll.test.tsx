import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAutoScroll } from './use-auto-scroll';

function Scroller({ count, content }: { count: number; content: string }) {
  const ref = useAutoScroll<HTMLDivElement>(count, content);
  return <div ref={ref} data-testid="scroller" />;
}

function setLayout(
  element: HTMLElement,
  { scrollHeight, clientHeight = 400 }: { scrollHeight: number; clientHeight?: number },
) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight });
}

describe('useAutoScroll', () => {
  it('scrolls to the bottom whenever a message is added', () => {
    const { getByTestId, rerender } = render(<Scroller count={0} content="" />);
    const scroller = getByTestId('scroller');

    setLayout(scroller, { scrollHeight: 500 });
    rerender(<Scroller count={2} content="a" />);
    expect(scroller.scrollTop).toBe(500);

    setLayout(scroller, { scrollHeight: 900 });
    rerender(<Scroller count={4} content="b" />);
    expect(scroller.scrollTop).toBe(900);
  });

  it('follows a streaming reply while the user is at the bottom', () => {
    const { getByTestId, rerender } = render(<Scroller count={0} content="" />);
    const scroller = getByTestId('scroller');
    setLayout(scroller, { scrollHeight: 500 });
    rerender(<Scroller count={2} content="Hel" />);

    setLayout(scroller, { scrollHeight: 700 });
    rerender(<Scroller count={2} content="Hello there" />);
    expect(scroller.scrollTop).toBe(700);
  });

  it('stops following the stream once the user scrolls up to read', () => {
    const { getByTestId, rerender } = render(<Scroller count={0} content="" />);
    const scroller = getByTestId('scroller');
    setLayout(scroller, { scrollHeight: 1000 });
    rerender(<Scroller count={2} content="Hel" />);

    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);
    setLayout(scroller, { scrollHeight: 1200 });
    rerender(<Scroller count={2} content="Hello there, a long answer" />);
    expect(scroller.scrollTop).toBe(100);
  });
});
