// B-06: one request asking the branch naming question, answered from knowledge/ by a real engine.
// Usage: npm run verify:knowledge [-- --engine anthropic|ollama|mock]   (default: anthropic)
// Starts Vite's own server in this process, sends exactly one request, and always closes the server
// before exiting. The engine's key comes from .env through the plugin; this script never reads it.
// Prints JSON and exits non-zero if the reply doesn't contain a string only knowledge/ has.
import { createServer } from 'vite';

const ROUTE = '/api/chat';
const QUESTION = 'What is our branch naming convention?';
// Only the PO's knowledge/branch-naming.md contains these (contract Decision 5).
const NEEDLES = ['<type>/<item-id>-<short-slug>', 'feat/b-06'];

const flag = process.argv.indexOf('--engine');
const engine = flag >= 0 ? process.argv[flag + 1] : 'anthropic';
if (!['anthropic', 'ollama', 'mock'].includes(engine)) {
  console.error('Usage: npm run verify:knowledge [-- --engine anthropic|ollama|mock]');
  process.exit(2);
}

// The plugin reads process.env over .env, so only the engine choice is set here.
process.env.INFERENCE_ENGINE = engine;
const server = await createServer({
  logLevel: 'silent',
  server: { port: 5330, strictPort: false, hmr: false },
});

const result = { engine, question: QUESTION, needles: NEEDLES };
try {
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error('Vite did not report a local URL');
  const started = performance.now();
  const response = await fetch(new URL(ROUTE, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: QUESTION }] }),
    signal: AbortSignal.timeout(180_000),
  });
  const events = (await response.text())
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  const reply = events
    .filter((event) => event.type === 'delta')
    .map((event) => event.text)
    .join('');
  const start = events.find((event) => event.type === 'start');
  const last = events.at(-1);
  Object.assign(result, {
    model: start?.model ?? null,
    status: response.status,
    last: last?.type === 'error' ? { type: 'error', code: last.error.code } : { type: last?.type },
    elapsedMs: Math.round(performance.now() - started),
    found: NEEDLES.filter((needle) => reply.includes(needle)),
    reply,
  });
} catch (error) {
  result.failure = String(error?.message ?? error).split('\n')[0];
} finally {
  await server.close();
}

result.pass = result.last?.type === 'done' && (result.found?.length ?? 0) > 0;
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.pass ? 0 : 1;
