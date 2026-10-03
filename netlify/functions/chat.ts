import { createWebApiHandler } from '../../server/llm/web-handler.ts';

// Variables come from the site's environment in the Netlify UI, never from files (ADR-03).
const handleApi = createWebApiHandler({ env: () => process.env });

/** Production entry point for /api/chat: a thin adapter over the shared chat core (ADR-13). */
export default function chat(request: Request): Response {
  return handleApi(request);
}

// Netlify reads this statically, so it must be literals; a test keeps the path equal to LLM_CONFIG.
export const config = {
  path: '/api/chat',
  // 6 requests per 3 minutes per visitor (contract Decision 5); over it, Netlify answers HTTP 429.
  rateLimit: { windowLimit: 6, windowSize: 180, aggregateBy: ['ip', 'domain'] },
};
