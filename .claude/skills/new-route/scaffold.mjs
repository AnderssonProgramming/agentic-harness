// Generator for the new-route skill: creates src/features/<name>/ from ./templates and registers
// the route in src/app/routes.ts. All-or-nothing: it validates everything before writing anything.
// Usage: node .claude/skills/new-route/scaffold.mjs --name <kebab-name> [--path <path>] [--title "<title>"] [--purpose "<sentence>"]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SKILL_DIR, '..', '..', '..');
const ROUTES_FILE = join(ROOT, 'src', 'app', 'routes.ts');
const IMPORT_MARKER = '// new-route: add imports above this line';
const ROUTE_MARKER = '  // new-route: add routes above this line';

function fail(message) {
  console.error(`new-route: ${message}`);
  console.error('Nothing was changed.');
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    path: { type: 'string' },
    title: { type: 'string' },
    purpose: { type: 'string' },
  },
});

// --- Validate inputs -------------------------------------------------------------------------

const name = values.name?.trim();
if (!name) fail('--name is required (kebab-case, e.g. knowledge or team-conventions).');
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name) || name.length < 2 || name.length > 30) {
  fail(`"${name}" is not a valid name. Use kebab-case, 2-30 characters, starting with a letter.`);
}

const rawPath = values.path?.trim() ?? name;
// Git Bash rewrites arguments starting with "/" into Windows paths ("/x" -> "C:/Program Files/Git/x").
if (/^[A-Za-z]:|\\/.test(rawPath)) {
  fail(`"${rawPath}" looks like a path converted by Git Bash. Pass it without the leading slash.`);
}
const path = `/${rawPath.replace(/^\/+|\/+$/g, '')}`;
if (path === '/') fail('"/" is the chat. Choose another path.');
if (!/^\/[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/.test(path)) {
  fail(`"${path}" is not a valid path. Use lowercase letters, digits, hyphens and slashes.`);
}

const words = name.split('-');
const Name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const CONST = words.map((w) => w.toUpperCase()).join('_');
const title = values.title?.trim() || words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const purpose = values.purpose?.trim() || 'Coming soon.';
if (title.length > 40) fail(`--title is ${title.length} characters; keep it at 40 or fewer.`);

// --- Check the target is free ----------------------------------------------------------------

if (!existsSync(ROUTES_FILE))
  fail(`${relative(ROOT, ROUTES_FILE)} not found. Run from the Compass repository.`);
const routesSource = readFileSync(ROUTES_FILE, 'utf8');
if (!routesSource.includes(IMPORT_MARKER) || !routesSource.includes(ROUTE_MARKER)) {
  fail('The marker comments in src/app/routes.ts are missing. Restore them before adding routes.');
}
if (routesSource.includes(`path: '${path}'`))
  fail(`The path ${path} is already registered in src/app/routes.ts.`);
if (routesSource.includes(`title: '${title.replace(/'/g, "\\'")}'`)) {
  fail(`A route titled "${title}" already exists. Titles must be unique in the navigation.`);
}
const featureDir = join(ROOT, 'src', 'features', name);
if (existsSync(featureDir)) fail(`src/features/${name}/ already exists.`);

// --- Render the templates ----------------------------------------------------------------------

const literal = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const tokens = {
  name,
  Name,
  CONST,
  titleLiteral: literal(title),
  purposeLiteral: literal(purpose),
};
const render = (template) =>
  readFileSync(join(SKILL_DIR, 'templates', template), 'utf8').replace(
    /\{\{(name|Name|CONST|titleLiteral|purposeLiteral)\}\}/g,
    (_, token) => tokens[token],
  );

const files = [
  ['index.ts', 'index.ts.tmpl'],
  [`model/${name}.ts`, 'model.ts.tmpl'],
  [`api/${name}-api.ts`, 'api.ts.tmpl'],
  [`hooks/use-${name}.ts`, 'hook.ts.tmpl'],
  [`hooks/use-${name}.test.ts`, 'hook.test.ts.tmpl'],
  [`components/${name}-view.tsx`, 'view.tsx.tmpl'],
  [`components/${name}-view.test.tsx`, 'view.test.tsx.tmpl'],
  [`components/${name}-screen.tsx`, 'screen.tsx.tmpl'],
].map(([target, template]) => [join(featureDir, target), render(template)]);

const updatedRoutes = routesSource
  .replace(IMPORT_MARKER, `import { ${Name}Screen } from '../features/${name}';\n${IMPORT_MARKER}`)
  .replace(
    ROUTE_MARKER,
    `  { path: '${path}', title: ${literal(title)}, component: ${Name}Screen },\n${ROUTE_MARKER}`,
  );

// --- Write -------------------------------------------------------------------------------------

for (const [file, content] of files) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
writeFileSync(ROUTES_FILE, updatedRoutes);

console.log(
  JSON.stringify(
    {
      name,
      path,
      title,
      purpose,
      created: files.map(([file]) => relative(ROOT, file).replaceAll('\\', '/')),
      modified: [relative(ROOT, ROUTES_FILE).replaceAll('\\', '/')],
      verify: `npm run verify:route -- ${path.slice(1)} "${title}"`,
    },
    null,
    2,
  ),
);
