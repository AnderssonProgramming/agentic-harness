import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StorageNotice } from './storage-notice';

describe('StorageNotice', () => {
  it('keeps an empty status region when there is nothing to report', () => {
    render(<StorageNotice notice={null} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it.each([
    ['unavailable', /blocking storage.*won't be saved/],
    ['full', /storage is full.*won't be saved/],
    ['reset', /couldn't be restored.*started a new one/],
  ] as const)('explains the %s notice', (notice, text) => {
    render(<StorageNotice notice={notice} />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });
});
