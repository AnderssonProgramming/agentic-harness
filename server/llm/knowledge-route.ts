import type { KnowledgeDoc } from '../../src/shared/llm/protocol.ts';
import { engineInfo, type ChatCoreOptions } from './chat-core.ts';
import { EMPTY_KNOWLEDGE } from './knowledge.ts';
import type { EngineName } from './engines/types.ts';

/**
 * `GET /api/knowledge` and `GET /api/knowledge/<source>` with no transport (B-07, ADR-14), like
 * the chat core (ADR-13). They serve only the documents the active engine was given, from memory:
 * a requested name is looked up in that list and never becomes a filesystem path.
 */
export interface KnowledgeRouteResult {
  status: 200 | 404 | 405 | 503;
  contentType: string | null;
  body: string | null;
  allow?: string;
}

const JSON_TYPE = 'application/json; charset=utf-8';
const TEXT_TYPE = 'text/plain; charset=utf-8';
const ENGINES: readonly string[] = ['anthropic', 'ollama', 'mock'];
const isEngineName = (name: string): name is EngineName => ENGINES.includes(name);

const notFound: KnowledgeRouteResult = { status: 404, contentType: null, body: null };

/**
 * @param subpath what follows the route: `""` or `"/"` for the list, `"/<encoded source>"` for one
 *   document. Anything else, including a second `/`, is 404.
 */
export function knowledgeRoute(
  {
    env,
    engineFor,
    knowledge = EMPTY_KNOWLEDGE,
  }: Pick<ChatCoreOptions, 'env' | 'engineFor' | 'knowledge'>,
  method: string,
  subpath: string,
): KnowledgeRouteResult {
  if (method !== 'GET') return { status: 405, contentType: null, body: null, allow: 'GET' };
  const isList = subpath === '' || subpath === '/';
  const encoded = isList ? '' : /^\/([^/]+)$/.exec(subpath)?.[1];
  if (encoded === undefined) return notFound;

  // The same engine resolution as /api/engine, so a bad configuration answers the same 503.
  const info = engineInfo({ env, engineFor });
  if (info.status !== 200)
    return { status: 503, contentType: JSON_TYPE, body: JSON.stringify(info.body) };
  const engine = info.body.engine;
  const served = isEngineName(engine) ? knowledge.included[engine] : [];

  if (isList) {
    const list: KnowledgeDoc[] = served.flatMap((source) => {
      const doc = knowledge.documents.get(source);
      return doc ? [{ source: doc.source, title: doc.title }] : [];
    });
    return { status: 200, contentType: JSON_TYPE, body: JSON.stringify(list) };
  }

  let source: string;
  try {
    source = decodeURIComponent(encoded);
  } catch {
    return notFound;
  }
  const doc = served.includes(source) ? knowledge.documents.get(source) : undefined;
  return doc ? { status: 200, contentType: TEXT_TYPE, body: doc.content } : notFound;
}
