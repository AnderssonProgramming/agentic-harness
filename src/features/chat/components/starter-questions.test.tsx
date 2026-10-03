import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { STARTER_QUESTIONS } from '../model/starter-questions';
import { StarterQuestions } from './starter-questions';

describe('StarterQuestions', () => {
  it('shows the four agreed questions as buttons, in order', () => {
    render(<StarterQuestions questions={STARTER_QUESTIONS} onPick={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'Suggested questions' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'What is our branch naming convention?',
      'How do deploys work here?',
      'What should I do in my first week?',
      'What does a code review need before I ask for one?',
    ]);
  });

  it('picks a question on click and from the keyboard', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<StarterQuestions questions={STARTER_QUESTIONS} onPick={onPick} />);

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'What is our branch naming convention?' }),
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'How do deploys work here?' }));

    expect(onPick.mock.calls).toEqual([
      ['What is our branch naming convention?'],
      ['How do deploys work here?'],
    ]);
  });

  it('re-checks the draft rules before picking', async () => {
    const onPick = vi.fn();
    render(<StarterQuestions questions={['   ']} onPick={onPick} />);
    await userEvent.setup().click(screen.getByRole('button'));
    expect(onPick).not.toHaveBeenCalled();
  });
});
