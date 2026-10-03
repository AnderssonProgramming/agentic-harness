// `npm run verify:prod:local`: the local production check in one foreground command (contract
// docs/delegations/deploy-netlify.md, Amendment 2). Starts serve:prod (mock engine, secrets empty)
// on free ports, waits for http://localhost:<port>, runs verify:prod against it, always stops the
// server tree, then proves nothing listens on its ports. Exits non-zero if any of that fails.
import { spawn } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { resolve } from 'node:path';
import { SECRET_NAME } from './serve-prod-env.mjs';
import { startServeProd, stopTree } from './serve-prod.mjs';

const root = resolve(import.meta.dirname, '..');
const STARTUP_TIMEOUT_MS = 240_000;
const CLOSE_TIMEOUT_MS = 15_000;
// The CLI binds IPv6 localhost, so the host is localhost, not 127.0.0.1 (Amendment 2, Decision 2).
const HOST = 'localhost';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
// Defense in depth for the log tail printed on failure; serve:prod never has a real key.
const redact = (text) => text.replace(/sk-ant-[\w-]+/g, '[redacted]');
// The CLI colours its output; ESC is built from its code so the pattern holds no control literal.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const plain = (text) => text.replace(ANSI, '');

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, HOST, () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

/** True if something accepts a TCP connection on the port, on IPv6 or IPv4 loopback. */
async function listening(port) {
  const probe = (host) =>
    new Promise((done) => {
      const socket = connect({ host, port });
      socket.setTimeout(2000);
      socket.once('connect', () => {
        socket.destroy();
        done(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        done(false);
      });
      socket.once('error', () => done(false));
    });
  return (await probe('::1')) || (await probe('127.0.0.1'));
}

const port = await freePort();
let functionsPort = await freePort();
while (functionsPort === port) functionsPort = await freePort();
const base = `http://${HOST}:${String(port)}/`;

const started = startServeProd(
  ['--port', String(port), '--functions-port', String(functionsPort)],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
if (started.error) {
  console.error(`verify:prod:local: ${started.error}`);
  process.exit(2);
}
const server = started.child;
let log = '';
const keep = (chunk) => {
  log = (log + chunk.toString()).slice(-200_000);
};
server.stdout.on('data', keep);
server.stderr.on('data', keep);
const serverExited = new Promise((done) => server.once('exit', (code) => done(code)));

let stopping = false;
async function stopAndConfirm() {
  stopping = true;
  stopTree(server);
  await Promise.race([serverExited, sleep(CLOSE_TIMEOUT_MS)]);
  const deadline = Date.now() + CLOSE_TIMEOUT_MS;
  let open = { port: true, functionsPort: true };
  while (Date.now() < deadline) {
    open = { port: await listening(port), functionsPort: await listening(functionsPort) };
    if (!open.port && !open.functionsPort) break;
    stopTree(server);
    await sleep(500);
  }
  return open;
}
process.on('exit', () => stopTree(server));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    void stopAndConfirm().then((open) => {
      console.error(`verify:prod:local: interrupted; ports still open: ${JSON.stringify(open)}`);
      process.exit(130);
    });
  });
}

// --- 1. Wait until the site answers ---------------------------------------------------------------
const startedAt = performance.now();
let up = false;
let exitedEarly = null;
void serverExited.then((code) => {
  exitedEarly = code;
});
while (!up && exitedEarly === null && performance.now() - startedAt < STARTUP_TIMEOUT_MS) {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(5000) });
    await response.body?.cancel();
    up = response.status === 200;
  } catch {
    // Not listening yet.
  }
  if (!up) await sleep(1000);
}
const startupMs = Math.round(performance.now() - startedAt);
// Snapshot now: after the stop below, the server's exit code is set anyway.
const exitedBeforeUp = exitedEarly;

// --- 2. verify:prod against it --------------------------------------------------------------------
let verifyCode = null;
let verifyReport = null;
if (up) {
  const run = spawn(process.execPath, ['scripts/verify-prod.mjs', base], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let out = '';
  run.stdout.on('data', (chunk) => (out += chunk.toString()));
  verifyCode = await new Promise((done) => run.once('exit', (code) => done(code ?? 1)));
  try {
    verifyReport = JSON.parse(out);
  } catch {
    verifyReport = { unparsed: redact(out).slice(-2000) };
  }
}

// --- 3. Stop the server, always, and prove its ports are closed -----------------------------------
const open = await stopAndConfirm();

// The CLI names (never values) the .env variables it injected; no secret may be among them.
const namesOn = (pattern) =>
  plain(log)
    .split(/\r?\n/)
    .filter((line) => pattern.test(line))
    .flatMap(
      (line) =>
        line
          .split(':')
          .slice(1)
          .join(':')
          .match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [],
    )
    .filter((name) => !/^(?:file|env|vars?|defined|in|process)$/i.test(name));
const injected = namesOn(/Injected .*env/i);
const ignored = namesOn(/Ignored .*env/i);
const injectedSecrets = injected.filter((name) => SECRET_NAME.test(name));

const checks = [
  { id: 'site-up', pass: up, detail: { url: base, startupMs, exitedBeforeUp } },
  { id: 'verify-prod', pass: verifyCode === 0, detail: { exitCode: verifyCode } },
  {
    id: 'engine-mock',
    pass: verifyReport?.engine === 'mock',
    detail: { engine: verifyReport?.engine ?? null },
  },
  {
    id: 'no-secret-injected',
    pass: up && injectedSecrets.length === 0,
    detail: { injectedFromDotEnv: injected, ignoredFromDotEnv: ignored, injectedSecrets },
  },
  {
    id: 'ports-closed',
    pass: !open.port && !open.functionsPort,
    detail: { port, functionsPort, stillListening: open },
  },
];
const pass = checks.every((c) => c.pass);
console.log(
  JSON.stringify(
    { engine: verifyReport?.engine ?? null, checks, verifyProd: verifyReport },
    null,
    2,
  ),
);
if (!pass) console.error(`--- serve:prod log tail ---\n${redact(plain(log)).slice(-4000)}`);
process.exitCode = verifyCode !== null && verifyCode !== 0 ? verifyCode : pass ? 0 : 1;
