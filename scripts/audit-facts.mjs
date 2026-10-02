// Deterministic facts for the audit skill (AUDIT-CRITERIA.md): secrets in tracked files and in git
// history, .env hygiene, the production bundle, and dependencies. It never prints a key: every match
// is masked to its first characters. Usage: npm run audit:facts   (prints JSON; always exits 0)
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, loadEnv } from 'vite';

const run = (command) =>
  execSync(command, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const tryRun = (command) => {
  try {
    return { ok: true, out: run(command) };
  } catch (error) {
    return {
      ok: false,
      out: String(error.stdout ?? ''),
      error: String(error.message).split('\n')[0],
    };
  }
};
const mask = (value) => `${value.slice(0, 10)}…(${String(value.length)} chars)`;

const KEY_PATTERNS = [
  { name: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{8,}/g },
  { name: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  {
    name: 'assigned-secret',
    re: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_\-./+]{16,}['"]/gi,
  },
];
const scanText = (text) =>
  KEY_PATTERNS.flatMap(({ name, re }) =>
    [...text.matchAll(re)].map((m) => ({ pattern: name, match: m[0] })),
  );

const facts = {
  generatedAt: new Date().toISOString(),
  commit: run('git rev-parse --short HEAD').trim(),
};

// --- Secrets in tracked files ------------------------------------------------------------------
const tracked = run('git ls-files').split('\n').filter(Boolean);
const binary = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|pdf|zip)$/i;
facts.secrets = { tracked: [], history: [] };
for (const file of tracked) {
  if (binary.test(file) || file === 'package-lock.json' || !existsSync(file)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const hit of scanText(line)) {
      facts.secrets.tracked.push({
        file,
        line: index + 1,
        pattern: hit.pattern,
        match: mask(hit.match),
      });
    }
  });
}

// --- Secrets in git history (added lines only) -------------------------------------------------
const history = run('git log -p --all --no-color "--format=@@commit %h"');
let commit = '';
let file = '';
const seen = new Set();
for (const line of history.split('\n')) {
  if (line.startsWith('@@commit ')) commit = line.slice(9).trim();
  else if (line.startsWith('+++ b/')) file = line.slice(6);
  else if (line.startsWith('+') && !line.startsWith('+++')) {
    for (const hit of scanText(line)) {
      const key = `${hit.pattern}|${hit.match}|${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      facts.secrets.history.push({ commit, file, pattern: hit.pattern, match: mask(hit.match) });
    }
  }
}

// --- .env hygiene --------------------------------------------------------------------------------
const exampleVars = existsSync('.env.example')
  ? readFileSync('.env.example', 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => {
        const [name, ...rest] = l.split('=');
        return { name, hasValue: rest.join('=').trim() !== '' };
      })
  : [];
facts.env = {
  envIgnored: tryRun('git check-ignore -q .env').ok,
  envEverCommitted: run('git log --all --format=%h -- .env').trim() !== '',
  exampleExists: existsSync('.env.example'),
  exampleVars,
  exampleSecretsWithValues: exampleVars
    .filter((v) => /KEY|SECRET|TOKEN|PASSWORD/.test(v.name) && v.hasValue)
    .map((v) => v.name),
};

// --- Production bundle ---------------------------------------------------------------------------
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const realKey = (env.ANTHROPIC_API_KEY ?? '').trim();
const outDir = mkdtempSync(join(tmpdir(), 'audit-build-'));
try {
  await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(outDir);
  const js = files.filter((f) => f.endsWith('.js'));
  const needles = ['ANTHROPIC_API_KEY', 'sk-ant-', ...(realKey ? [realKey] : [])];
  facts.bundle = {
    jsFiles: js.length,
    jsBytes: js.reduce((s, f) => s + statSync(f).size, 0),
    jsGzipBytes: js.reduce((s, f) => s + gzipSync(readFileSync(f)).length, 0),
    secrets: files.flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      return needles
        .filter((n) => text.includes(n))
        .map((n) => ({
          file: f.slice(outDir.length + 1),
          found: n === realKey ? 'the real key' : n,
        }));
    }),
    realKeyChecked: Boolean(realKey),
  };
} catch (error) {
  facts.bundle = { error: String(error) };
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

// --- Dependencies --------------------------------------------------------------------------------
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const runtime = Object.keys(pkg.dependencies ?? {});
const dev = Object.keys(pkg.devDependencies ?? {});
const searchable = tracked.filter(
  (f) =>
    /\.(m?[jt]sx?|json|cjs)$/.test(f) &&
    f !== 'package-lock.json' &&
    f !== 'package.json' &&
    existsSync(f),
);
const corpus =
  searchable.map((f) => readFileSync(f, 'utf8')).join('\n') + JSON.stringify(pkg.scripts ?? {});
const used = (name) => {
  if (corpus.includes(`'${name}`) || corpus.includes(`"${name}`)) return true;
  if (name.startsWith('@types/')) return true; // type packages are used by the compiler, not imported
  const bin = name.split('/').at(-1);
  return new RegExp(`(^|[\\s"'])${bin}(\\s|$|")`, 'm').test(
    JSON.stringify(pkg.scripts ?? {}).replace(/\\"/g, '"'),
  );
};
const licenseOf = (name) => {
  try {
    const meta = JSON.parse(readFileSync(join('node_modules', name, 'package.json'), 'utf8'));
    return typeof meta.license === 'string'
      ? meta.license
      : JSON.stringify(meta.license ?? meta.licenses ?? null);
  } catch {
    return 'unknown (not installed)';
  }
};
const auditRun = tryRun('npm audit --json');
let auditSummary;
try {
  const parsed = JSON.parse(auditRun.out);
  auditSummary = parsed.metadata?.vulnerabilities ?? parsed;
} catch {
  auditSummary = { error: auditRun.error ?? 'npm audit output was not JSON (offline?)' };
}
facts.deps = {
  runtime,
  dev,
  unused: [...runtime, ...dev].filter((name) => !used(name)),
  licenses: Object.fromEntries([...runtime, ...dev].map((name) => [name, licenseOf(name)])),
  audit: auditSummary,
};

console.log(JSON.stringify(facts, null, 2));
