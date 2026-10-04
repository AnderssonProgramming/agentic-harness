import { useEffect, useRef } from 'react';

export interface SourcePanelDocument {
  source: string;
  title: string;
  state: 'loading' | 'ready' | 'error';
  text: string;
}

interface SourcePanelProps {
  document: SourcePanelDocument;
  onClose: () => void;
}

/**
 * One of the team's documents, opened from a source chip (B-07, ADR-14). The text is shown as
 * plain text, never rendered as HTML or Markdown.
 */
export function SourcePanel({ document, onClose }: SourcePanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus moves into the panel when it opens and when it switches to another document.
  useEffect(() => {
    headingRef.current?.focus();
  }, [document.source]);

  return (
    <aside
      className="source-panel"
      role="dialog"
      aria-labelledby="source-panel-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="source-panel__header">
        <h3 id="source-panel-title" className="source-panel__title" ref={headingRef} tabIndex={-1}>
          {document.title}
          <span className="source-panel__source">{document.source}</span>
        </h3>
        <button
          type="button"
          className="source-panel__close"
          aria-label="Close document"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {document.state === 'loading' && (
        <p className="source-panel__status" role="status">
          Loading the document…
        </p>
      )}
      {document.state === 'error' && (
        <p className="source-panel__status source-panel__status--error" role="alert">
          This document couldn&apos;t be loaded. Close the panel and try again.
        </p>
      )}
      {document.state === 'ready' && <pre className="source-panel__text">{document.text}</pre>}
    </aside>
  );
}
