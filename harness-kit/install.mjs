// Installs the harness into a project: copies the core templates (and any profiles) without
// overwriting existing files, fills the product name, adds the harness's npm scripts, and merges
// the Claude Code permissions. Usage (see HARNESS.md, "Install it in a new project"):
//   node harness-kit/install.mjs <project dir> --name "<Product name>" [--profile netlify]
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const target = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : undefined;
const name = option('name');
const profiles = (option('profile') ?? '').split(',').filter(Boolean);

if (!target || !name) {
  console.error(
    'Usage: node harness-kit/install.mjs <project dir> --name "<Product name>" [--profile netlify]',
  );
  process.exit(2);
}
if (!existsSync(join(target, 'package.json'))) {
  console.error(`${target} has no package.json. Create the project first (HARNESS.md, step 1).`);
  process.exit(2);
}
for (const profile of profiles) {
  if (!existsSync(join(kit, 'profiles', profile))) {
    console.error(
      `Unknown profile "${profile}". Available: ${readdirSync(join(kit, 'profiles')).join(', ')}`,
    );
    process.exit(2);
  }
}

const copied = [];
const skipped = [];
const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const install = (sourceDir) => {
  for (const file of walk(sourceDir)) {
    // Templates keep `.claude/` as `dot-claude/`, so Claude Code never discovers the kit's own
    // skills as if they belonged to the project that holds the kit.
    const rel = relative(sourceDir, file).replace(/^dot-claude(?=[\\/])/, '.claude');
    if (rel === 'profile.json') continue;
    const dest = join(target, rel);
    if (existsSync(dest)) {
      skipped.push(rel);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    if (/\.(md|json)$/.test(rel)) {
      writeFileSync(dest, readFileSync(file, 'utf8').replaceAll('{{PRODUCT_NAME}}', name));
    } else {
      cpSync(file, dest);
    }
    copied.push(rel);
  }
};

install(join(kit, 'templates', 'core'));
for (const profile of profiles) install(join(kit, 'profiles', profile));

// npm scripts: the harness's own, plus format/check placeholders only when the project has none.
const pkgPath = join(target, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.scripts ??= {};
const scripts = {
  'audit:facts': 'node scripts/audit-facts.mjs',
  'audit:validate': 'node scripts/audit-validate.mjs',
  'context:profile': 'node scripts/context-profile.mjs',
};
const settingsAllow = [];
for (const profile of profiles) {
  const meta = JSON.parse(readFileSync(join(kit, 'profiles', profile, 'profile.json'), 'utf8'));
  Object.assign(scripts, meta.scripts ?? {});
  settingsAllow.push(...(meta.allow ?? []));
}
const addedScripts = [];
for (const [key, value] of Object.entries(scripts)) {
  if (pkg.scripts[key] === undefined) {
    pkg.scripts[key] = value;
    addedScripts.push(key);
  }
}
const missingCore = ['format', 'check', 'test'].filter((key) => pkg.scripts[key] === undefined);
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

// Permissions: add the profiles' allow rules to .claude/settings.json (installed or existing).
const settingsPath = join(target, '.claude', 'settings.json');
if (settingsAllow.length && existsSync(settingsPath)) {
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  settings.permissions ??= {};
  settings.permissions.allow ??= [];
  for (const rule of settingsAllow) {
    if (!settings.permissions.allow.includes(rule)) settings.permissions.allow.push(rule);
  }
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

console.log(`Installed the harness into ${target}`);
console.log(
  `  copied ${String(copied.length)} files${profiles.length ? ` (profiles: ${profiles.join(', ')})` : ''}`,
);
if (skipped.length) console.log(`  kept existing: ${skipped.join(', ')}`);
if (addedScripts.length) console.log(`  npm scripts added: ${addedScripts.join(', ')}`);
if (missingCore.length) {
  console.log(
    `  MISSING npm scripts the harness relies on: ${missingCore.join(', ')} (HARNESS.md, step 2)`,
  );
}
console.log(
  `Next: fill the {{…}} fields (HARNESS.md, step 4), then run: node "${join(kit, 'doctor.mjs')}" "${target}"`,
);
