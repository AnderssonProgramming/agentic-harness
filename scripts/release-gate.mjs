// Release gate: decides whether HEAD may be released. Read by the release skill before anything is
// built or deployed. Blocks on: a dirty or unpushed tree, an audit that doesn't cover the current
// code, any Critical finding, any High finding not accepted in docs/audit/accepted-risks.md, npm
// advisories outside the accepted packages' subtrees, or a failing `npm run check`.
// Settings in harness.config.json, under "release": codePaths (what the audit must cover) and
// acceptedAdvisoryRoots (packages whose dependency trees may carry advisories the PO accepted).
// Usage: npm run release:gate   (prints JSON; exit 0 = may release)
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { assessDependencies } from './lib/dependency-scope.mjs';

const config = existsSync('harness.config.json')
  ? (JSON.parse(readFileSync('harness.config.json', 'utf8')).release ?? {})
  : {};
const CODE = (config.codePaths ?? ['src', 'package.json', 'package-lock.json']).join(' ');
const ROOTS = config.acceptedAdvisoryRoots ?? [];

const run = (command) =>
  execSync(command, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
// stdout and stderr stay separate: npm ls and npm audit exit non-zero but still print valid JSON
// on stdout, and mixing in stderr made that JSON unreadable.
const attempt = (command) => {
  try {
    return { ok: true, out: run(command), err: '' };
  } catch (error) {
    return { ok: false, out: String(error.stdout ?? ''), err: String(error.stderr ?? '') };
  }
};
const checks = [];
const check = (id, pass, detail) => checks.push({ id, pass: Boolean(pass), detail });

// 1. The tree is clean, on main, and pushed: we release exactly what is on GitHub.
const status = run('git status --porcelain').trim();
check(
  'clean-tree',
  status === '',
  status === '' ? 'clean' : status.split('\n').slice(0, 5).join('; '),
);
const branch = run('git rev-parse --abbrev-ref HEAD').trim();
check('on-main', branch === 'main', branch);
attempt('git fetch -q origin');
const head = run('git rev-parse HEAD').trim();
const remote = attempt('git rev-parse origin/main');
check(
  'pushed',
  remote.ok && remote.out.trim() === head,
  remote.ok
    ? `HEAD ${head.slice(0, 7)} / origin ${remote.out.trim().slice(0, 7)}`
    : 'no origin/main',
);

// 2. The latest audit covers the code being released.
const report = readFileSync('AUDIT-REPORT.md', 'utf8');
const auditCommit = /^- Commit: ([0-9a-f]{7,40})/m.exec(report)?.[1];
if (!auditCommit) {
  check('audit-covers-code', false, 'AUDIT-REPORT.md has no "- Commit:" line');
} else {
  const ancestor = attempt(`git merge-base --is-ancestor ${auditCommit} HEAD`).ok;
  const changed = ancestor ? run(`git diff --name-only ${auditCommit} HEAD -- ${CODE}`).trim() : '';
  check(
    'audit-covers-code',
    ancestor && changed === '',
    !ancestor
      ? `audit commit ${auditCommit} isn't an ancestor of HEAD`
      : changed === ''
        ? `audit ran on ${auditCommit}; no code changed since`
        : `code changed since the audit (${auditCommit}): ${changed.split('\n').slice(0, 6).join(', ')}. Run /audit first`,
  );
}
check('audit-valid', attempt('npm run -s audit:validate').ok, 'npm run audit:validate');

// 3. No Critical; every High accepted by the PO for its criterion.
const section = (title) => {
  const start = report.indexOf(`## ${title}`);
  const end = report.indexOf('\n## ', start + 3);
  return start === -1 ? '' : report.slice(start, end === -1 ? undefined : end);
};
const rows = (text) =>
  text
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l))
    .slice(1)
    .map((l) =>
      l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    );
const findings = rows(section('Findings'));
const accepted = new Set(
  rows(readFileSync('docs/audit/accepted-risks.md', 'utf8')).map((r) => r[0]),
);
const critical = findings.filter((f) => f[3] === 'Critical');
const unacceptedHigh = findings.filter((f) => f[3] === 'High' && !accepted.has(f[1]));
check(
  'no-critical',
  critical.length === 0,
  critical.map((f) => `${f[0]} ${f[1]} ${f[2]}`).join('; ') || 'none',
);
check(
  'highs-accepted',
  unacceptedHigh.length === 0,
  unacceptedHigh.map((f) => `${f[0]} ${f[1]} ${f[2]} (not in accepted-risks.md)`).join('; ') ||
    `none open (${String(findings.filter((f) => f[3] === 'High').length)} High, all accepted)`,
);

// 4. npm advisories only inside the subtrees of packages the PO accepted (docs/audit/accepted-risks.md).
// A risk is contained only if no top-level dependency outside ROOTS can reach the package. Each
// check is recorded exactly once: unreadable input is a failure, never a pass next to a failure.
const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const auditJson = parse(attempt('npm audit --json').out);
const lsJson = parse(attempt('npm ls --all --json').out);
const inside = ROOTS.join(', ') || 'no accepted package';
if (!auditJson || !lsJson) {
  const which = !auditJson ? 'npm audit' : 'npm ls';
  check('advisories-contained', false, `${which} output was not JSON (offline?)`);
  check('deps-tree-contained', false, `${which} output was not JSON (offline?)`);
} else {
  const advisories = auditJson.vulnerabilities ?? {};
  const deps = assessDependencies({
    tree: lsJson.dependencies ?? {},
    problems: lsJson.problems ?? [],
    advisories,
    roots: ROOTS,
  });
  check(
    'advisories-contained',
    deps.advisoriesOutside.length === 0,
    deps.advisoriesOutside.length === 0
      ? `${String(Object.keys(advisories).length)} advisories, all inside ${inside}`
      : `outside the accepted packages: ${deps.advisoriesOutside.join(', ')}`,
  );
  check(
    'deps-tree-contained',
    deps.problemsOutside.length === 0,
    deps.problemsOutside.length === 0
      ? `${String(deps.problemsInside)} npm ls problem(s), all inside ${inside}`
      : `npm ls problems outside the accepted packages: ${deps.problemsOutside.join('; ')}`,
  );
}

// 5. The full check passes on exactly this commit.
const full = attempt('npm run -s check');
check(
  'check-passes',
  full.ok,
  full.ok
    ? 'npm run check'
    : `${full.out}${full.err}`.split('\n').filter(Boolean).slice(-6).join(' | '),
);

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ commit: head.slice(0, 7), mayRelease: ok, checks }, null, 2));
process.exitCode = ok ? 0 : 1;
