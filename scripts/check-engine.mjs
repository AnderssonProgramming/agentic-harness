// Smoke test for the inference engine switch documented in ARCHITECTURE.md.
// Usage: npm run engine:check   (reads .env if present)

const engine = process.env.INFERENCE_ENGINE ?? 'anthropic';
const prompt = 'Reply with the single word: OK';

async function checkAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is empty. Set it in .env.');
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { model, reply: data.content?.[0]?.text ?? '' };
}

async function checkOllama() {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL ?? 'phi3';
  let res;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: prompt }] }),
    });
  } catch {
    throw new Error(`Ollama is not running on ${baseUrl}. Start it with: ollama serve`);
  }
  if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { model, reply: data.message?.content ?? '' };
}

const checks = { anthropic: checkAnthropic, ollama: checkOllama };
const check = checks[engine];

if (!check) {
  console.error(
    `Unknown INFERENCE_ENGINE "${engine}". Use one of: ${Object.keys(checks).join(', ')}`,
  );
  process.exit(1);
}

try {
  const started = Date.now();
  const { model, reply } = await check();
  console.log(
    `engine: ${engine}\nmodel:  ${model}\nreply:  ${reply.trim()}\ntime:   ${Date.now() - started} ms`,
  );
} catch (error) {
  console.error(`engine: ${engine}\nerror:  ${error.message}`);
  process.exit(1);
}
