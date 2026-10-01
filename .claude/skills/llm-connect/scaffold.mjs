// Generator for the llm-connect skill: writes server/llm/, src/shared/llm/ and scripts/verify-llm.mjs
// from ./templates and applies five small patches. All-or-nothing: every input and every patch
// target is checked before anything is written.
// Usage: node .claude/skills/llm-connect/scaffold.mjs --system "<who the assistant is>"
//   [--route /api/chat] [--default-engine anthropic|ollama|mock] [--anthropic-model <id>]
//   [--ollama-model <name>] [--history-chars 24000]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SKILL_DIR, '..', '..', '..');
const TEMPLATES = join(SKILL_DIR, 'templates');
const rel = (file) => relative(ROOT, file).replaceAll('\\', '/');

function fail(message) {
  console.error(`llm-connect: ${message}`);
  console.error('Nothing was changed.');
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    system: { type: 'string' },
    route: { type: 'string' },
    'default-engine': { type: 'string' },
    'anthropic-model': { type: 'string' },
    'ollama-model': { type: 'string' },
    'history-chars': { type: 'string' },
  },
});

// --- Inputs --------------------------------------------------------------------------------------

const system = values.system?.trim();
if (!system)
  fail(
    '--system is required: one paragraph telling the model who it is. Ask the user; never invent it.',
  );
if (system.length < 40)
  fail('--system is too short to describe the assistant (at least 40 characters).');

const rawRoute = (values.route ?? 'api/chat').trim();
// Git Bash rewrites arguments starting with "/" into Windows paths.
if (/^[A-Za-z]:|\\/.test(rawRoute))
  fail(`"${rawRoute}" looks like a path converted by Git Bash. Pass it without the leading slash.`);
const route = `/${rawRoute.replace(/^\/+|\/+$/g, '')}`;
if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(route))
  fail(`--route "${route}" must be lowercase letters, digits, hyphens and slashes.`);

const defaultEngine = (values['default-engine'] ?? 'anthropic').trim();
if (!['anthropic', 'ollama', 'mock'].includes(defaultEngine))
  fail('--default-engine must be anthropic, ollama or mock.');

const anthropicModel = (values['anthropic-model'] ?? 'claude-sonnet-5').trim();
const ollamaModel = (values['ollama-model'] ?? 'phi3').trim();
for (const [flag, value] of [
  ['--anthropic-model', anthropicModel],
  ['--ollama-model', ollamaModel],
]) {
  if (!/^[A-Za-z0-9._:/-]+$/.test(value)) fail(`${flag} "${value}" has invalid characters.`);
}

const historyChars = Number(values['history-chars'] ?? '24000');
if (!Number.isInteger(historyChars) || historyChars < 2000 || historyChars > 500000) {
  fail('--history-chars must be a whole number between 2000 and 500000.');
}

// --- Targets must be free, patch anchors must exist ----------------------------------------------

for (const dir of ['server/llm', 'src/shared/llm']) {
  if (existsSync(join(ROOT, dir)))
    fail(`${dir}/ already exists. This skill creates a connection; it doesn't update one.`);
}
if (existsSync(join(ROOT, 'scripts/verify-llm.mjs')))
  fail('scripts/verify-llm.mjs already exists.');

const read = (file) => {
  const path = join(ROOT, file);
  if (!existsSync(path)) fail(`${file} not found. Run from the project root.`);
  return readFileSync(path, 'utf8');
};

const patches = [];
function patch(file, transform, anchorDescription) {
  const before = read(file);
  const after = transform(before);
  if (after === null)
    fail(`${file}: ${anchorDescription} not found. Patch it by hand or restore the expected line.`);
  patches.push([file, after]);
}

patch(
  'vite.config.ts',
  (s) => {
    if (!/plugins: \[react\(\)\]/.test(s)) return null;
    const lastImport = [...s.matchAll(/^import .*;$/gm)].at(-1);
    if (!lastImport) return null;
    const at = (lastImport.index ?? 0) + lastImport[0].length;
    return `${s.slice(0, at)}\nimport { llmApi } from './server/llm/vite-plugin.ts';${s.slice(at)}`.replace(
      'plugins: [react()]',
      'plugins: [react(), llmApi()]',
    );
  },
  '"plugins: [react()]"',
);
patch(
  'tsconfig.node.json',
  (s) => {
    if (!s.includes('"include": ["vite.config.ts"]') || !s.includes('"noEmit": true,')) return null;
    return s
      .replace('"include": ["vite.config.ts"]', '"include": ["vite.config.ts", "server"]')
      .replace('"noEmit": true,', '"noEmit": true,\n    "allowImportingTsExtensions": true,');
  },
  '"include": ["vite.config.ts"] and "noEmit": true',
);
patch(
  'tsconfig.app.json',
  (s) => {
    if (s.includes('allowImportingTsExtensions')) return s;
    if (!s.includes('"noEmit": true,')) return null;
    return s.replace('"noEmit": true,', '"noEmit": true,\n    "allowImportingTsExtensions": true,');
  },
  '"noEmit": true',
);
patch(
  'eslint.config.js',
  (s) => {
    const anchor = "files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],";
    if (!s.includes(anchor)) return null;
    return s.replace(anchor, "files: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'vite.config.ts'],");
  },
  "the typed block \"files: ['src/**/*.{ts,tsx}', 'vite.config.ts']\"",
);
patch(
  'package.json',
  (s) => {
    const pkg = JSON.parse(s);
    if (!pkg.scripts) return null;
    pkg.scripts['verify:llm'] = 'node scripts/verify-llm.mjs';
    return `${JSON.stringify(pkg, null, 2)}\n`;
  },
  'a "scripts" section',
);
patch(
  '.env.example',
  (s) => {
    const wanted = {
      INFERENCE_ENGINE: defaultEngine,
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_MODEL: anthropicModel,
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: ollamaModel,
      MOCK_DELAY_MS: '25',
    };
    const missing = Object.entries(wanted).filter(([key]) => !new RegExp(`^${key}=`, 'm').test(s));
    if (missing.length === 0) return s;
    const block = missing.map(([key, value]) => `${key}=${value}`).join('\n');
    return `${s.replace(/\n*$/, '\n')}\n# Added by llm-connect. INFERENCE_ENGINE: anthropic | ollama | mock (no model, for tests).\n${block}\n`;
  },
  '.env.example',
);

// --- Render --------------------------------------------------------------------------------------

const tokens = {
  route,
  defaultEngine,
  anthropicModel,
  ollamaModel,
  historyChars: String(historyChars),
  systemLiteral: JSON.stringify(system),
};
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const files = walk(TEMPLATES).map((template) => {
  const target = join(ROOT, relative(TEMPLATES, template).replace(/\.tmpl$/, ''));
  const content = readFileSync(template, 'utf8').replace(
    /\{\{(route|defaultEngine|anthropicModel|ollamaModel|historyChars|systemLiteral)\}\}/g,
    (_, token) => tokens[token],
  );
  return [target, content];
});

for (const [target, content] of files) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
for (const [file, content] of patches) writeFileSync(join(ROOT, file), content);

console.log(
  JSON.stringify(
    {
      route,
      defaultEngine,
      anthropicModel,
      ollamaModel,
      historyChars,
      created: files.map(([target]) => rel(target)).sort(),
      modified: patches.map(([file]) => file),
      verify: 'npm run verify:llm',
    },
    null,
    2,
  ),
);
