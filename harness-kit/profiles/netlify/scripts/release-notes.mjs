// Release notes from Conventional Commits since the previous release tag (v*), grouped by type.
// Usage: npm run release:notes -- <version>   (prints Markdown)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: npm run release:notes -- <version>');
  process.exit(2);
}
const run = (command) =>
  execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
let previous = '';
try {
  previous = run('git describe --tags --abbrev=0 --match "v*"');
} catch {
  previous = '';
}
const range = previous ? `${previous}..HEAD` : 'HEAD';
const lines = run(`git log ${range} --no-merges "--format=%h%x09%s"`).split('\n').filter(Boolean);
const GROUPS = [
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['test', 'Tests'],
  ['build', 'Build and dependencies'],
  ['docs', 'Documentation and harness'],
  ['style', 'Style'],
  ['chore', 'Chores'],
];
const grouped = new Map(GROUPS.map(([type]) => [type, []]));
const other = [];
for (const line of lines) {
  const [hash, subject] = line.split('\t');
  const type = /^(\w+)(\([^)]*\))?!?:/.exec(subject)?.[1];
  (grouped.get(type ?? '') ?? other).push(`- ${subject} (\`${hash}\`)`);
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const product = pkg.productName ?? pkg.name;
const date = new Date().toISOString().slice(0, 10);
const out = [
  `# ${product} ${version}`,
  '',
  `Released ${date}. Changes since ${previous || 'the first commit'} (${String(lines.length)} commits).`,
  '',
];
for (const [type, title] of GROUPS) {
  const items = grouped.get(type) ?? [];
  if (items.length > 0) out.push(`## ${title}`, '', ...items, '');
}
if (other.length > 0) out.push('## Other', '', ...other, '');
console.log(out.join('\n'));
