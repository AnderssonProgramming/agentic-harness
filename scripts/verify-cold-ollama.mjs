// B-13: the first reply from a cold Ollama model completes. Unloads the model, starts its own Vite
// server on the Ollama engine (with the real first-chunk and idle timeouts), sends one message,
// records the time to the first chunk, and stops the server before exiting. Runs in the
// foreground. Usage: npm run verify:cold-ollama   (exits non-zero if the reply doesn't complete)
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';

const MODEL = 'phi3';
const OLLAMA = 'http://127.0.0.1:11434';
const OLD_IDLE_TIMEOUT_MS = 20_000;

/** The models Ollama has in memory right now; throws when Ollama doesn't answer. */
async function loadedModels() {
  const response = await fetch(`${OLLAMA}/api/ps`);
  if (!response.ok) throw new Error(`Ollama /api/ps answered HTTP ${String(response.status)}`);
  const { models } = await response.json();
  return models.map((m) => m.name);
}

const isModel = (name) => name === MODEL || name.startsWith(`${MODEL}:`);

async function chat(url) {
  const started = performance.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
    }),
  });
  const events = [];
  let firstChunkMs = null;
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === 'delta' && firstChunkMs === null)
        firstChunkMs = performance.now() - started;
      events.push(event);
    }
  }
  return { events, firstChunkMs, totalMs: performance.now() - started };
}

// 1. Unload the model, then prove it's cold. /api/ps answering is what shows it *could* be listed.
try {
  execFileSync('ollama', ['stop', MODEL], { stdio: 'ignore' });
} catch {
  // Not loaded: nothing to stop. The check below decides.
}
const before = await loadedModels();
if (before.some(isModel)) {
  console.error(`FAIL: ${MODEL} is still loaded after "ollama stop": ${before.join(', ')}`);
  process.exit(1);
}
console.log(`cold: ${MODEL} not loaded (loaded models: ${before.join(', ') || 'none'})`);

// 2. A server on the Ollama engine. Only the variables this run needs; the Anthropic key is blanked.
Object.assign(process.env, {
  INFERENCE_ENGINE: 'ollama',
  OLLAMA_BASE_URL: OLLAMA,
  OLLAMA_MODEL: MODEL,
  ANTHROPIC_API_KEY: '',
});
const server = await createServer({
  logLevel: 'silent',
  server: { port: 5330, strictPort: false, hmr: false },
});
let reply;
try {
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error('Vite did not report a local URL');
  reply = await chat(new URL('/api/chat', base).href);
} finally {
  await server.close();
}

// 3. The run loaded the model (it was cold before), and the reply completed.
const after = await loadedModels();
const last = reply.events.at(-1);
const text = reply.events
  .filter((e) => e.type === 'delta')
  .map((e) => e.text)
  .join('');
const seconds = (ms) => (ms === null ? 'none' : `${(ms / 1000).toFixed(1)} s`);
const checks = [
  ['the model was loaded by this run', after.some(isModel)],
  ['the reply ended with done', last?.type === 'done'],
  ['the reply has text', text.trim().length > 0],
];
console.log(`time to first chunk: ${seconds(reply.firstChunkMs)}`);
console.log(`total time: ${seconds(reply.totalMs)}`);
console.log(
  `first chunk later than the old 20 s idle timeout: ${String(reply.firstChunkMs !== null && reply.firstChunkMs > OLD_IDLE_TIMEOUT_MS)}`,
);
console.log(
  `last event: ${last?.type === 'error' ? `error ${last.error.code}` : String(last?.type)}`,
);
console.log(`reply: ${JSON.stringify(text.slice(0, 120))}`);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
process.exit(checks.every(([, pass]) => pass) ? 0 : 1);
