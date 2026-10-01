// Shared helpers for the browser verification scripts: start the app with Vite's Node API and
// drive headless Chrome over the DevTools protocol using Node's built-in WebSocket (no deps).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(read, { timeoutMs, message }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (value) return value;
    } catch {
      // not ready yet
    }
    await sleep(100);
  }
  throw new Error(message);
}

// Uses APP_URL if set (e.g. a dev server you already started); otherwise starts one on a free port.
export async function startApp() {
  if (process.env.APP_URL) return { url: process.env.APP_URL, close: async () => {} };
  const { createServer } = await import('vite');
  const server = await createServer({
    logLevel: 'error',
    server: { port: 5199, strictPort: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Vite did not report a local URL');
  return { url, close: () => server.close() };
}

// Pass profileDir to keep the profile (and its storage) after close, e.g. to reopen it later.
export async function openChrome({ width = 900, height = 700, profileDir } = {}) {
  const profile = profileDir ?? mkdtempSync(join(tmpdir(), 'compass-chrome-'));
  // A kept profile is reused, so a stale port file must not be mistaken for the new one.
  rmSync(join(profile, 'DevToolsActivePort'), { force: true });
  // Port 0 lets Chrome pick a free port and write it to DevToolsActivePort, so runs can be parallel.
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const spawnError = new Promise((_, reject) => chrome.once('error', reject));
  const exited = new Promise((resolve) => chrome.once('exit', resolve));

  const port = await Promise.race([
    spawnError,
    waitUntil(() => readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0], {
      timeoutMs: 15_000,
      message: `Chrome did not start. Is it installed at ${CHROME}? Set CHROME_PATH otherwise.`,
    }),
  ]);
  const base = `http://127.0.0.1:${port}`;
  const target = await waitUntil(
    async () => (await (await fetch(`${base}/json/list`)).json()).find((t) => t.type === 'page'),
    { timeoutMs: 10_000, message: 'Chrome has no page target' },
  );
  const browserVersion = (await (await fetch(`${base}/json/version`)).json()).Browser;

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  let nextId = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(
        msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text,
      );
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (m) =>
        m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result),
      );
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  return {
    browserVersion,
    consoleErrors,
    send,
    evaluate,
    goto: (url) => send('Page.navigate', { url }),
    waitFor: (expression, timeoutMs = 10_000) =>
      waitUntil(() => evaluate(expression), {
        timeoutMs,
        message: `Timed out waiting for: ${expression}`,
      }),
    typeText: (text) => send('Input.insertText', { text }),
    pressEnter: async (modifiers = 0) => {
      const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, text: '\r' });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    },
    settle: () =>
      evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'),
    setColorScheme: (value) =>
      send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] }),
    screenshot: async (path) => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(data, 'base64'));
    },
    // A graceful exit, so Chrome flushes storage to the profile; kill() is only the fallback.
    close: async () => {
      send('Browser.close').catch(() => {});
      const graceful = await Promise.race([exited.then(() => true), sleep(10_000)]);
      ws.close();
      if (!graceful) {
        chrome.kill();
        await sleep(300);
      }
      if (!profileDir) rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

export function createReport() {
  const results = [];
  return {
    check: (id, criterion, pass, detail) => {
      results.push({ id, criterion, pass: Boolean(pass), detail });
    },
    // Prints JSON (for evidence files) and returns the exit code.
    finish: (extra = {}) => {
      console.log(JSON.stringify({ ...extra, results }, null, 2));
      return results.every((r) => r.pass) ? 0 : 1;
    },
  };
}
