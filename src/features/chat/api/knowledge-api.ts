import { isKnowledgeDoc, type KnowledgeDoc } from '../../../shared/llm/protocol';

const KNOWLEDGE_ENDPOINT = '/api/knowledge';

/** Resolves to null when the list is unavailable (server unreachable, error, odd answer). */
export type GetKnowledgeList = () => Promise<readonly KnowledgeDoc[] | null>;

/** Resolves to the document's text, or null when it can't be read (unknown name, error). */
export type GetKnowledgeDocument = (source: string) => Promise<string | null>;

// Integration point (ADR-07): the documents the server gave the model, for citations (B-07).
export const getKnowledgeList: GetKnowledgeList = async () => {
  try {
    const response = await fetch(KNOWLEDGE_ENDPOINT);
    if (!response.ok) return null;
    const list: unknown = await response.json();
    return Array.isArray(list) && list.every(isKnowledgeDoc)
      ? list.map(({ source, title }) => ({ source, title }))
      : null;
  } catch {
    return null;
  }
};

export const getKnowledgeDocument: GetKnowledgeDocument = async (source) => {
  try {
    const response = await fetch(`${KNOWLEDGE_ENDPOINT}/${encodeURIComponent(source)}`);
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
};
