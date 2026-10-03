// Profiles a headless agent transcript (claude -p --output-format stream-json --verbose > run.jsonl):
// context tokens per model call, compactions, and which tool results filled the context.
// Usage: npm run context:profile -- <run.jsonl> [label]   (see CONTEXT-ROUTINE.md)
import { readFileSync } from 'node:fs';
const [file, label = file] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run context:profile -- <run.jsonl> [label]');
  process.exit(2);
}
const lines = readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((x) => {
    try {
      return JSON.parse(x);
    } catch {
      return {};
    }
  });

const calls = [];
const seen = new Set();
const toolUse = new Map();
const results = [];
for (const m of lines) {
  if (m.type === 'system' && m.subtype === 'compact_boundary') calls.push({ compact: true });
  if (m.type === 'assistant') {
    const u = m.message.usage;
    if (u && !seen.has(m.message.id)) {
      seen.add(m.message.id);
      calls.push({
        context:
          (u.input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0),
        out: u.output_tokens ?? 0,
      });
    }
    for (const c of m.message.content) if (c.type === 'tool_use') toolUse.set(c.id, c);
  }
  if (m.type === 'user' && Array.isArray(m.message?.content)) {
    for (const c of m.message.content) {
      if (c.type !== 'tool_result') continue;
      const text = typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
      const use = toolUse.get(c.tool_use_id);
      const what = use
        ? use.name === 'Bash'
          ? `Bash ${use.input.command.split(/\s+/).slice(0, 4).join(' ')}`
          : `${use.name} ${(use.input.file_path ?? use.input.pattern ?? '').split(/[\\/]/).slice(-2).join('/')}`
        : '?';
      results.push({ chars: text.length, what, error: Boolean(c.is_error) });
    }
  }
}
const r = lines.find((x) => x.type === 'result');
const contexts = calls.filter((c) => !c.compact).map((c) => c.context);
const total = results.reduce((s, x) => s + x.chars, 0);
const byTool = {};
for (const x of results) {
  const k = x.what
    .split(' ')
    .slice(0, x.what.startsWith('Bash') ? 3 : 1)
    .join(' ');
  byTool[k] = (byTool[k] ?? 0) + x.chars;
}
console.log(`== ${label}`);
console.log(
  `model calls: ${contexts.length}, turns: ${r?.num_turns}, duration: ${Math.round((r?.duration_ms ?? 0) / 1000)} s, cost: USD ${r?.total_cost_usd?.toFixed(2)}, compactions: ${calls.filter((c) => c.compact).length}`,
);
console.log(
  `context tokens: first ${contexts[0]}, max ${Math.max(...contexts)}, last ${contexts.at(-1)}, growth x${(contexts.at(-1) / contexts[0]).toFixed(1)}`,
);
console.log(
  `tool results: ${results.length}, ${total} chars total (~${Math.round(total / 4)} tokens), errors: ${results.filter((x) => x.error).length}`,
);
console.log('largest results:');
for (const x of [...results].sort((a, b) => b.chars - a.chars).slice(0, 5))
  console.log(`  ${String(x.chars).padStart(6)} chars  ${x.what}${x.error ? '  [error]' : ''}`);
console.log(
  'by kind:',
  Object.entries(byTool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}=${v}`)
    .join(', '),
);
