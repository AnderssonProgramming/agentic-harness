// B-07: two live requests checked through the browser's own citation parser (ADR-14).
// Usage: npm run verify:citations [-- --engine anthropic|ollama|mock]   (default: anthropic)
//   1. "What is our branch naming convention?" must end with a Sources line naming a loaded document.
//   2. A question knowledge/ doesn't cover must say so, with no Sources line.
// Starts Vite's own server in this process, sends exactly two chat requests, and always closes the
// server before exiting. The engine's key comes from .env through the plugin; this script never
// reads it. Prints JSON and exits non-zero if a check fails.
import { createServer } from 'vite';

const COVERED = 'What is our branch naming convention?';
const UNCOVERED = 'Which state management library do we use for global state in the frontend?';
// What the system prompt asks the model to say when no document applies (system-prompt.ts).
const NOT_COVERED = /(don't|do not|doesn't|does not) cover|not covered|no team document/i;

const flag = process.argv.indexOf('--engine');
const engine = flag >= 0 ? process.argv[flag + 1] : 'anthropic';
if (!['anthropic', 'ollama', 'mock'].includes(engine)) {
  console.error('Usage: npm run verify:citations [-- --engine anthropic|ollama|mock]');
  process.exit(2);
}

// The plugin reads process.env over .env, so only the engine choice is set here.
process.env.INFERENCE_ENGINE = engine;
const server = await createServer({
  logLevel: 'silent',
  server: { port: 5340, strictPort: false, hmr: false },
});

async function ask(base, question) {
  const started = performance.now();
  const response = await fetch(new URL('/api/chat', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
    signal: AbortSignal.timeout(180_000),
  });
  const events = (await response.text())
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  const start = events.find((event) => event.type === 'start');
  const last = events.at(-1);
  return {
    model: start?.model ?? null,
    last: last?.type === 'error' ? `error:${last.error.code}` : last?.type,
    elapsedMs: Math.round(performance.now() - started),
    reply: events
      .filter((event) => event.type === 'delta')
      .map((event) => event.text)
      .join(''),
  };
}

const result = { engine, checks: [] };
const check = (id, criterion, pass, detail) => {
  result.checks.push({ id, criterion, pass: Boolean(pass), detail });
};

try {
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error('Vite did not report a local URL');
  // The same parser and classifier the browser runs on render.
  const { parseSources, classifySources } = await server.ssrLoadModule(
    '/src/features/chat/model/citations.ts',
  );
  const documents = await (await fetch(new URL('/api/knowledge', base))).json();
  result.loaded = documents.map((doc) => doc.source);

  const covered = await ask(base, COVERED);
  const coveredCitations = classifySources(parseSources(covered.reply).sources, documents);
  const known = coveredCitations.filter((c) => c.status === 'known').map((c) => c.source);
  const served = await Promise.all(
    known.map(async (source) => {
      const response = await fetch(new URL(`/api/knowledge/${encodeURIComponent(source)}`, base));
      return { source, status: response.status, chars: (await response.text()).length };
    }),
  );
  result.covered = { question: COVERED, ...covered, citations: coveredCitations, served };
  check(
    'B-07 #1',
    'A knowledge answer ends with known source chip(s), branch-naming.md among them, and each opens',
    covered.last === 'done' &&
      known.includes('branch-naming.md') &&
      coveredCitations.every((c) => c.status === 'known') &&
      served.every((s) => s.status === 200 && s.chars > 0),
    JSON.stringify(coveredCitations.map((c) => `${c.source}:${c.status}`)),
  );

  const uncovered = await ask(base, UNCOVERED);
  const uncoveredSources = parseSources(uncovered.reply).sources;
  result.uncovered = { question: UNCOVERED, ...uncovered, sources: uncoveredSources };
  check(
    'B-07 #3',
    'When no document applies, the answer says so and shows no source',
    uncovered.last === 'done' && uncoveredSources.length === 0 && NOT_COVERED.test(uncovered.reply),
    JSON.stringify({ sources: uncoveredSources, saysSo: NOT_COVERED.test(uncovered.reply) }),
  );

  const probe = await fetch(new URL('/api/knowledge/..%2Fpackage.json', base));
  check(
    'B-07 #4',
    'The live route refuses a path outside the loaded list',
    probe.status === 404,
    `GET /api/knowledge/..%2Fpackage.json → ${String(probe.status)}`,
  );
} catch (error) {
  check('—', 'Script completed', false, String(error?.message ?? error).split('\n')[0]);
} finally {
  await server.close();
}

result.pass = result.checks.length > 0 && result.checks.every((c) => c.pass);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.pass ? 0 : 1;
