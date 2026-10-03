// `npm run serve:prod [-- --port <n>] [--functions-port <n>]`: builds and serves the app plus the
// Functions locally with `netlify serve --offline`, on the mock engine and with every secret empty
// (contract docs/delegations/deploy-netlify.md, Amendment 2). Refuses debug flags and secrets.
// Exported as startServeProd for verify:prod:local, which must own the process to stop it.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { childEnv, refusal, secretNamesFrom, serveArgs } from './serve-prod-env.mjs';

const root = resolve(import.meta.dirname, '..');

/** The netlify-cli entry script, run with this Node so no shell or .cmd shim is involved. */
function netlifyBin() {
  const dir = join(root, 'node_modules', 'netlify-cli');
  const { bin } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  return join(dir, typeof bin === 'string' ? bin : (bin.netlify ?? bin.ntl));
}

/** Starts netlify serve, or returns { error } without starting. */
export function startServeProd(args, { stdio = 'inherit' } = {}) {
  const reason = refusal(args, process.env);
  if (reason) return { error: reason };
  const secrets = secretNamesFrom(readFileSync(join(root, '.env.example'), 'utf8'));
  const child = spawn(process.execPath, [netlifyBin(), ...serveArgs(args)], {
    cwd: root,
    env: childEnv(process.env, secrets),
    stdio,
    // On POSIX its own group, so the whole tree can be signalled.
    detached: process.platform !== 'win32',
  });
  return { child };
}

/** Stops the server and every process it started (the CLI spawns its own children). */
export function stopTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const started = startServeProd(process.argv.slice(2));
  if (started.error) {
    console.error(`serve:prod: ${started.error}`);
    process.exit(2);
  }
  const { child } = started;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stopTree(child));
  child.on('exit', (code) => process.exit(code ?? 1));
}
