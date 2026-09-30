import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDocumentTitle } from './use-document-title';

describe('useDocumentTitle', () => {
  it('sets the browser tab title and updates it when the title changes', () => {
    const { rerender } = renderHook(
      ({ title }) => {
        useDocumentTitle(title);
      },
      { initialProps: { title: 'Chat' } },
    );
    expect(document.title).toBe('Chat · Compass');

    rerender({ title: 'Knowledge' });
    expect(document.title).toBe('Knowledge · Compass');
  });
});
