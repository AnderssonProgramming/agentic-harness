import { useCallback, useEffect, useRef, useState } from 'react';
import type { KnowledgeDoc } from '../../../shared/llm/protocol';
import {
  getKnowledgeDocument,
  getKnowledgeList,
  type GetKnowledgeDocument,
  type GetKnowledgeList,
} from '../api/knowledge-api';
import { findKnownSource } from '../model/citations';

/** The document shown in the side panel (B-07). */
export interface OpenDocument {
  source: string;
  title: string;
  state: 'loading' | 'ready' | 'error';
  /** The document's text once ready; empty otherwise. */
  text: string;
}

export interface Knowledge {
  /** The documents the server gave the model; null until known, or when unavailable. */
  documents: readonly KnowledgeDoc[] | null;
  opened: OpenDocument | null;
  /** Opens a loaded document; does nothing for any other name. */
  open: (source: string) => void;
  close: () => void;
}

interface UseKnowledgeOptions {
  list?: GetKnowledgeList;
  document?: GetKnowledgeDocument;
}

export function useKnowledge({
  list = getKnowledgeList,
  document = getKnowledgeDocument,
}: UseKnowledgeOptions = {}): Knowledge {
  const [documents, setDocuments] = useState<readonly KnowledgeDoc[] | null>(null);
  const [opened, setOpened] = useState<OpenDocument | null>(null);
  // The latest request, so a slow answer for a document closed or replaced since is ignored.
  const latest = useRef(0);

  useEffect(() => {
    let active = true;
    void list().then((loaded) => {
      if (active) setDocuments(loaded);
    });
    return () => {
      active = false;
    };
  }, [list]);

  const open = useCallback(
    (source: string) => {
      // The chip is only rendered for a known name; the handler checks again (CLAUDE.md).
      const doc = findKnownSource(source, documents);
      if (!doc) return;
      const request = ++latest.current;
      setOpened({ source: doc.source, title: doc.title, state: 'loading', text: '' });
      void document(doc.source).then((text) => {
        if (request !== latest.current) return;
        setOpened(
          text === null
            ? { source: doc.source, title: doc.title, state: 'error', text: '' }
            : { source: doc.source, title: doc.title, state: 'ready', text },
        );
      });
    },
    [document, documents],
  );

  const close = useCallback(() => {
    latest.current++;
    setOpened(null);
  }, []);

  return { documents, opened, open, close };
}
