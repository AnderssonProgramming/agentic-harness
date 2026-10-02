import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TodoNotices } from './todo-notices';

const notices = () => screen.getAllByRole('status').map((notice) => notice.textContent);

describe('TodoNotices (B-11, Amendment 1)', () => {
  it('shows the engine notice only while the engine is known to have no actions', () => {
    const { rerender } = render(<TodoNotices actionsAvailable={false} reset={false} />);
    expect(notices()).toEqual([
      "Compass can't change your to-do list with the current engine. Your saved to-dos are safe.",
      '',
    ]);
    rerender(<TodoNotices actionsAvailable={true} reset={false} />);
    expect(notices()).toEqual(['', '']);
    rerender(<TodoNotices actionsAvailable={null} reset={false} />);
    expect(notices()).toEqual(['', '']);
  });

  it('says when the saved to-do list was reset', () => {
    render(<TodoNotices actionsAvailable={true} reset={true} />);
    expect(notices()).toEqual(['', "Your saved to-do list couldn't be read, so it was reset."]);
  });
});
