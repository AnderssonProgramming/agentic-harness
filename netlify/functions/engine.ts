import { knowledgeDirCandidates, loadKnowledge } from '../../server/llm/knowledge.ts';
import { createWebApiHandler } from '../../server/llm/web-handler.ts';

// Variables come from the site's environment in the Netlify UI, never from files (ADR-03).
// The documents are read once per cold start, like the chat Function, so /api/knowledge serves
// exactly what the chat sends (B-07); netlify.toml's included_files ships them to every Function.
const handleApi = createWebApiHandler({
  env: () => process.env,
  knowledge: loadKnowledge(knowledgeDirCandidates(process.cwd(), process.env.LAMBDA_TASK_ROOT)),
});

/**
 * Production entry point for /api/engine and /api/knowledge[/<source>]: a thin adapter over the
 * shared core (ADR-13, ADR-14).
 */
export default function engine(request: Request): Response {
  return handleApi(request);
}

// Its own rule, so page loads don't spend the chat's 6 requests (contract Amendment 1, decision 2).
// The knowledge paths share it: the free plan allows no third rule (B-07, Decision 2).
export const config = {
  path: ['/api/engine', '/api/knowledge', '/api/knowledge/*'],
  rateLimit: { windowLimit: 60, windowSize: 180, aggregateBy: ['ip', 'domain'] },
};
