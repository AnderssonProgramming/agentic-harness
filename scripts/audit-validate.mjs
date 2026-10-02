// Checks that AUDIT-REPORT.md follows the audit skill's fixed format, so runs stay comparable:
// every criterion of AUDIT-CRITERIA.md appears exactly once, every finding has a file:line and a
// valid risk, and the counts by risk match the findings table. Usage: npm run audit:validate [-- <report>]
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2] ?? 'AUDIT-REPORT.md';
const criteriaIds = [
  ...readFileSync('AUDIT-CRITERIA.md', 'utf8').matchAll(/^\| ([A-Z]+-\d{2}) \|/gm),
].map((m) => m[1]);
const report = readFileSync(reportPath, 'utf8');
const RISKS = ['Critical', 'High', 'Medium', 'Low'];
const problems = [];

const section = (title) => {
  const start = report.indexOf(`## ${title}`);
  if (start === -1) {
    problems.push(`Missing section "## ${title}"`);
    return '';
  }
  const next = report.indexOf('\n## ', start + 3);
  return report.slice(start, next === -1 ? undefined : next);
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

// 1. Every criterion exactly once in the criteria table, as met or failed.
const criteriaRows = rows(section('Criteria'));
for (const id of criteriaIds) {
  const found = criteriaRows.filter((r) => r[0] === id);
  if (found.length !== 1)
    problems.push(
      `Criterion ${id} appears ${String(found.length)} times in "Criteria" (expected 1)`,
    );
  else if (!/^(met|failed)$/i.test(found[0][1] ?? ''))
    problems.push(`Criterion ${id}: result must be "met" or "failed", got "${found[0][1] ?? ''}"`);
}
for (const r of criteriaRows)
  if (!criteriaIds.includes(r[0]))
    problems.push(`"Criteria" lists ${r[0]}, which isn't in AUDIT-CRITERIA.md`);

// 2. Findings: | ID | Criterion | File | Risk | Evidence | Proposed fix |
const findingRows = rows(section('Findings'));
const failed = criteriaRows.filter((r) => /^failed$/i.test(r[1] ?? '')).map((r) => r[0]);
for (const r of findingRows) {
  const [id, criterion, file, risk] = r;
  if (!/^F-\d{2}$/.test(id ?? '')) problems.push(`Finding "${id ?? ''}": ID must look like F-01`);
  if (!criteriaIds.includes(criterion ?? ''))
    problems.push(`Finding ${id}: criterion "${criterion ?? ''}" isn't in AUDIT-CRITERIA.md`);
  if (!/[\w./-]+:\d+/.test(file ?? ''))
    problems.push(`Finding ${id}: "File" needs a path:line, got "${file ?? ''}"`);
  if (!RISKS.includes(risk ?? ''))
    problems.push(`Finding ${id}: risk "${risk ?? ''}" isn't one of ${RISKS.join(', ')}`);
}
for (const id of new Set(findingRows.map((r) => r[1]))) {
  const n = findingRows.filter((r) => r[1] === id).length;
  if (n > 1)
    problems.push(
      `Criterion ${id ?? ''} has ${String(n)} findings; the skill requires exactly one per failed criterion`,
    );
}
for (const id of failed) {
  if (!findingRows.some((r) => r[1] === id))
    problems.push(`Criterion ${id} is "failed" but has no finding`);
}

// 3. Counts by risk match the table.
const counts = Object.fromEntries(rows(section('Counts by risk')).map((r) => [r[0], Number(r[1])]));
for (const risk of RISKS) {
  const actual = findingRows.filter((r) => r[3] === risk).length;
  if (counts[risk] !== actual)
    problems.push(
      `Counts: ${risk} says ${String(counts[risk])}, the findings table has ${String(actual)}`,
    );
}

console.log(
  JSON.stringify(
    {
      report: reportPath,
      criteria: criteriaIds.length,
      findings: findingRows.length,
      valid: problems.length === 0,
      problems,
    },
    null,
    2,
  ),
);
process.exitCode = problems.length === 0 ? 0 : 1;
