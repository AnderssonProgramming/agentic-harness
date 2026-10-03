// Checks that a project's harness is complete and filled in. Exits 1 if anything blocks a session.
// Usage: node harness-kit/doctor.mjs <project dir>
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const target = resolve(process.argv[2] ?? '.');
const problems = [];
const warnings = [];
const read = (rel) => readFileSync(join(target, rel), 'utf8');

// 1. Layer files exist.
const required = [
  'CLAUDE.md',
  'CONTEXT-ROUTINE.md',
  'BACKLOG.md',
  'ARCHITECTURE.md',
  'AUDIT-CRITERIA.md',
  'TECH-DEBT.md',
  '.claude/settings.json',
  '.claude/agents/feature-builder.md',
  '.claude/skills/audit/SKILL.md',
  'docs/delegations/_TEMPLATE.md',
  'docs/audit/accepted-risks.md',
  'scripts/audit-facts.mjs',
  'scripts/audit-validate.mjs',
  'harness.config.json',
];
for (const rel of required) if (!existsSync(join(target, rel))) problems.push(`missing ${rel}`);

// 2. Unfilled {{…}} fields. CLAUDE.md and the settings block a session; the rest are warnings,
// because templates such as _TEMPLATE.md keep their fields on purpose.
const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    if (['node_modules', '.git', 'dist', 'build', 'harness-kit'].includes(entry)) return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const mustBeFilled = ['CLAUDE.md', 'harness.config.json', '.claude/settings.json'];
const templatesByDesign = [
  'docs/delegations/_TEMPLATE.md',
  'CONTEXT-LOG.md',
  'TASKS.md',
  'TECH-DEBT.md',
];
for (const file of walk(target).filter((f) => /\.(md|json)$/.test(f))) {
  const rel = relative(target, file).replaceAll('\\', '/');
  if (templatesByDesign.includes(rel)) continue;
  const fields = [
    ...new Set(readFileSync(file, 'utf8').match(/\{\{[A-Z][A-Z0-9_]*[^{}\n]*\}\}/g) ?? []),
  ];
  if (!fields.length) continue;
  const message = `${rel}: ${String(fields.length)} unfilled field(s), e.g. ${fields.slice(0, 3).join(' ')}`;
  (mustBeFilled.includes(rel) ? problems : warnings).push(message);
}

// 3. npm scripts the harness relies on.
if (existsSync(join(target, 'package.json'))) {
  const scripts = JSON.parse(read('package.json')).scripts ?? {};
  for (const key of ['format', 'check', 'test', 'audit:facts', 'audit:validate']) {
    if (scripts[key] === undefined) problems.push(`package.json has no "${key}" script`);
  }
  if (existsSync(join(target, '.claude/skills/release'))) {
    for (const key of ['release:gate', 'release:notes', 'release:deploy', 'verify:prod']) {
      if (scripts[key] === undefined) problems.push(`the release skill needs a "${key}" script`);
    }
    if (!existsSync(join(target, 'netlify.toml')))
      problems.push('the release skill needs a netlify.toml');
  }
} else {
  problems.push('no package.json');
}

// 4. Secrets hygiene: .env is ignored by git and denied to the agent.
const inGit = (() => {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: target, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
if (!inGit) {
  problems.push('not a git repository (the harness depends on commits as checkpoints)');
} else {
  try {
    execSync('git check-ignore -q .env', { cwd: target, stdio: 'ignore' });
  } catch {
    problems.push('.env is not ignored by git: add it to .gitignore');
  }
}
if (existsSync(join(target, '.claude/settings.json'))) {
  const deny = JSON.parse(read('.claude/settings.json')).permissions?.deny ?? [];
  if (!deny.includes('Read(./.env)'))
    problems.push('.claude/settings.json does not deny Read(./.env)');
}

// 5. The skills listed in CLAUDE.md exist, and every installed skill is listed.
if (existsSync(join(target, 'CLAUDE.md')) && existsSync(join(target, '.claude/skills'))) {
  const claude = read('CLAUDE.md');
  for (const skill of readdirSync(join(target, '.claude/skills'))) {
    if (!claude.includes(`\`${skill}\``))
      warnings.push(`skill "${skill}" is installed but CLAUDE.md doesn't list it`);
  }
}

for (const p of problems) console.log(`FAIL  ${p}`);
for (const w of warnings) console.log(`warn  ${w}`);
console.log(
  problems.length
    ? `\n${String(problems.length)} problem(s): fix them before the first session.`
    : '\nHarness OK.',
);
process.exit(problems.length ? 1 : 0);
