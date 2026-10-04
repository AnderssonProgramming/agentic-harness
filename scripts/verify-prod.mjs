// Production smoke check for a deployed Compass (contract docs/delegations/deploy-netlify.md).
// Usage: npm run verify:prod -- <url> [--rate-limit]
// Prints JSON results and exits non-zero if any check fails. It never prints a key.
// --rate-limit spends real requests: it checks that the 7th API request within 3 minutes is refused.
import { loadEnv } from 'vite';

const args = process.argv.slice(2);
const rateLimit = args.includes('--rate-limit');
const target = args.find((arg) => !arg.startsWith('--'));
if (!target) {
  console.error('Usage: npm run verify:prod -- <url> [--rate-limit]');
  process.exit(2);
}
const base = new URL(target);
const CHAT = new URL('/api/chat', base).href;
const ENGINE = new URL('/api/engine', base).href;
const REQUEST_TIMEOUT_MS = 120_000;

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const realKey = (env.ANTHROPIC_API_KEY ?? '').trim();
// The same needles as audit:facts.
const NEEDLES = ['ANTHROPIC_API_KEY', 'sk-ant-', ...(realKey ? [realKey] : [])];

const results = [];
const check = (id, criterion, pass, detail) =>
  results.push({ id, criterion, pass: Boolean(pass), detail });
// Every request to the Function, in order, so the rate-limit check can count them.
const apiCalls = [];
const recordCall = (route, status) => apiCalls.push({ route, status, at: performance.now() });

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    text: await response.text(),
  };
}

/**
 * Sends one chat request and reads the NDJSON stream to its end, timing it. The reply text is
 * returned beside the outcome, not in it, so the printed report stays short.
 */
async function chatWithText(content) {
  let text = '';
  const outcome = await chat(content, (delta) => (text += delta));
  return { outcome, text };
}

async function chat(content, onDelta = () => {}) {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const outcome = { status: null, events: 0, chars: 0, last: null, elapsedMs: 0, cut: false };
  try {
    const response = await fetch(CHAT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    outcome.status = response.status;
    recordCall('chat', response.status);
    if (!(response.headers.get('content-type') ?? '').includes('application/x-ndjson')) {
      await response.body?.cancel();
      outcome.elapsedMs = elapsed();
      return outcome;
    }
    const decoder = new TextDecoder();
    let buffer = '';
    const take = (line) => {
      if (line.trim() === '') return;
      const event = JSON.parse(line);
      outcome.events += 1;
      outcome.last =
        event.type === 'error' ? { type: 'error', code: event.error.code } : { type: event.type };
      if (event.type === 'start') outcome.engine = `${event.engine}/${event.model}`;
      if (event.type === 'delta') {
        outcome.chars += event.text.length;
        onDelta(event.text);
      }
    };
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(take);
    }
    take(buffer);
  } catch (error) {
    outcome.failure = String(error?.message ?? error).split('\n')[0];
    if (outcome.status === null) recordCall('chat', 'network error');
  }
  outcome.elapsedMs = elapsed();
  // A 200 stream that ends without done or error was cut by something between us and the engine.
  outcome.cut =
    outcome.status === 200 && outcome.last?.type !== 'done' && outcome.last?.type !== 'error';
  return outcome;
}

// --- 1. The app's HTML and JS load ---------------------------------------------------------------
const html = await get(base.href).catch((error) => ({
  status: null,
  type: '',
  text: '',
  error: String(error),
}));
check(
  'app-html',
  'The app HTML loads',
  html.status === 200 && html.type.includes('text/html') && html.text.includes('id="root"'),
  {
    status: html.status,
    type: html.type,
    ...(html.error ? { error: html.error } : {}),
  },
);

const queue = [...html.text.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(
  (m) => new URL(m[1], base).href,
);
const scripts = new Map();
while (queue.length > 0) {
  const url = queue.shift();
  if (scripts.has(url) || new URL(url).origin !== base.origin) continue;
  const file = await get(url).catch((error) => ({
    status: null,
    type: '',
    text: '',
    error: String(error),
  }));
  scripts.set(url, file);
  // Chunks Vite loads from the entry: relative imports and its preload list ("assets/x.js").
  for (const m of file.text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+\.js)["']/g))
    queue.push(new URL(m[1], url).href);
  for (const m of file.text.matchAll(/["'](\/?assets\/[^"'\s]+\.js)["']/g))
    queue.push(new URL(m[1].replace(/^\//, ''), base).href);
}
const loaded = [...scripts.values()];
check(
  'app-js',
  'Every JS file the app references loads',
  loaded.length > 0 && loaded.every((f) => f.status === 200 && /javascript/.test(f.type)),
  {
    files: [...scripts].map(([url, f]) => ({
      path: new URL(url).pathname,
      status: f.status,
      type: f.type,
    })),
  },
);

// --- 2. No key name or value in any served JS file (nor the HTML) --------------------------------
const served = [
  ['/', html.text],
  ...[...scripts].map(([url, f]) => [new URL(url).pathname, f.text]),
];
const leaks = served.flatMap(([path, text]) =>
  NEEDLES.filter((needle) => text.includes(needle)).map((needle) => ({
    path,
    found: needle === realKey ? 'the real key' : needle,
  })),
);
check(
  'no-secrets',
  'No key name or key value in any served JS file',
  loaded.length > 0 && leaks.length === 0,
  {
    scannedFiles: served.length,
    needles: NEEDLES.length,
    realKeyChecked: Boolean(realKey),
    leaks,
  },
);

// --- 3. /api/engine answers ------------------------------------------------------------------------
let engineInfo = null;
try {
  const response = await fetch(ENGINE, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  recordCall('engine', response.status);
  const text = await response.text();
  engineInfo = {
    status: response.status,
    body: (() => {
      try {
        return JSON.parse(text);
      } catch {
        return text.slice(0, 200);
      }
    })(),
  };
} catch (error) {
  recordCall('engine', 'network error');
  engineInfo = { status: null, error: String(error) };
}
check(
  'api-engine',
  '/api/engine answers with the active engine',
  engineInfo.status === 200 && typeof engineInfo.body?.engine === 'string',
  engineInfo,
);

// --- 4. A short chat request completes with done --------------------------------------------------
const short = await chat('In one short sentence: what can you help me with?');
check(
  'chat-short',
  'A short chat request completes with done',
  short.last?.type === 'done' && short.chars > 0,
  short,
);

// --- 5. A full-length reply completes ------------------------------------------------------------
const long = await chat(
  'Write a detailed onboarding guide for a junior frontend developer in their second week: about 750 words ' +
    '(roughly 1,000 tokens), in plain paragraphs, covering how to read an unfamiliar codebase, how to ask good ' +
    'questions, how code review works, and how to plan the first month. Do not stop early.',
);
check(
  'chat-full-length',
  'A ~1,000-token reply reaches done (a cut stream fails and reports the elapsed time)',
  long.last?.type === 'done',
  {
    ...long,
    note: long.cut
      ? `The stream was cut after ${String(long.elapsedMs)} ms without done or error: the platform's real limit is about that.`
      : undefined,
  },
);

// --- 6. The answer comes from knowledge/ (B-06) -----------------------------------------------------
// Only the PO's branch-naming.md contains these strings. On the mock (verify:prod:local), it
// echoes the document a question names, which proves knowledge/ reached the deployed Function.
const KNOWLEDGE_NEEDLES = ['<type>/<item-id>-<short-slug>', 'feat/b-06'];
const branch = await chatWithText('What is our branch naming convention?');
const branchFound = KNOWLEDGE_NEEDLES.filter((needle) => branch.text.includes(needle));
check(
  'knowledge-branch-naming',
  'The branch naming answer comes from knowledge/ (B-06)',
  branch.outcome.last?.type === 'done' && branchFound.length > 0,
  { ...branch.outcome, found: branchFound, needles: KNOWLEDGE_NEEDLES },
);

// --- 6b. The engine Function serves the loaded documents, and nothing else (B-07) ------------------
// Not recorded in apiCalls: they go to the engine Function's own rule, not the chat's, and the
// rate-limit count below stays as it was.
const list = await get(new URL('/api/knowledge', base).href);
const listed = (() => {
  try {
    return JSON.parse(list.text).map((doc) => doc.source);
  } catch {
    return null;
  }
})();
const doc = await get(new URL('/api/knowledge/branch-naming.md', base).href);
const outside = await get(new URL('/api/knowledge/..%2Fpackage.json', base).href);
check(
  'knowledge-route',
  '/api/knowledge lists the loaded documents, serves one, and refuses a path outside the list (B-07)',
  list.status === 200 &&
    listed?.includes('branch-naming.md') &&
    doc.status === 200 &&
    doc.text.includes(KNOWLEDGE_NEEDLES[0]) &&
    outside.status === 404,
  { listed, document: doc.status, outside: outside.status },
);

// --- 7. Optional: the 7th API request within 3 minutes is refused --------------------------------
if (rateLimit) {
  while (apiCalls.length < 7 && !apiCalls.some((call) => call.status === 429)) {
    await chat('Reply with the single word OK.');
  }
  const firstLimited = apiCalls.findIndex((call) => call.status === 429) + 1;
  check(
    'rate-limit',
    'The 7th API request within 3 minutes gets HTTP 429, which the client shows as rate_limit',
    firstLimited === 7 && apiCalls[6]?.route === 'chat',
    {
      calls: apiCalls.map(({ route, status }, index) => ({ n: index + 1, route, status })),
      firstLimited: firstLimited || null,
      secondsFromFirstToLastCall: Math.round(
        ((apiCalls.at(-1)?.at ?? 0) - (apiCalls[0]?.at ?? 0)) / 1000,
      ),
      note:
        firstLimited > 0 && firstLimited < 7
          ? 'Limited before the 7th: earlier requests from this address are still in the 3-minute window. Wait 3 minutes and run again.'
          : 'HTTP 429 → rate_limit is proved by src/shared/llm/client.test.ts.',
    },
  );
}

console.log(
  JSON.stringify({ url: base.href, engine: engineInfo?.body?.engine ?? null, results }, null, 2),
);
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
