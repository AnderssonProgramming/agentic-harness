import { createWebApiHandler } from '../../server/llm/web-handler.ts';

// Variables come from the site's environment in the Netlify UI, never from files (ADR-03).
const handleApi = createWebApiHandler({ env: () => process.env });

/** Production entry point for /api/engine: a thin adapter over the shared chat core (ADR-13). */
export default function engine(request: Request): Response {
  return handleApi(request);
}

// Its own rule, so page loads don't spend the chat's 6 requests (contract Amendment 1, decision 2).
export const config = {
  path: '/api/engine',
  rateLimit: { windowLimit: 60, windowSize: 180, aggregateBy: ['ip', 'domain'] },
};
