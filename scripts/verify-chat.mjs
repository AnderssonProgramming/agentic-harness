// Verifies the B-01 and B-02 acceptance criteria in real headless Chrome, driven over the
// DevTools protocol with Node's built-in WebSocket (no extra dependencies).
// Usage: npm run dev, then in another terminal: npm run verify:chat
// Writes screenshots to docs/evidence/ and exits non-zero if any criterion fails.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/';
const OUT = process.argv[2] ?? 'docs/evidence';
const PORT = 9333;
const profile = join(tmpdir(), `b01-profile-${Date.now()}`);
mkdirSync(profile, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    break;
  } catch {
    await sleep(200);
  }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let nextId = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.exceptionThrown')
    consoleErrors.push(msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
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
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const key = async (modifiers = 0) => {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: '\r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
};
const typeText = (text) => send('Input.insertText', { text });
const settle = () =>
  evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
const count = () => evaluate("document.querySelectorAll('.message-list > li').length");
const screenshot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
};

const results = [];
const check = (id, criterion, pass, detail) => {
  results.push({ id, criterion, pass, detail });
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 900,
  height: 700,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'light' }],
});
await send('Page.navigate', { url: APP_URL });
for (
  let i = 0;
  i < 50 && !(await evaluate("!!document.querySelector('#composer-input')").catch(() => false));
  i++
)
  await sleep(200);
await evaluate("document.querySelector('#composer-input').focus()");

// Empty state
const empty = await evaluate("document.querySelector('.chat-empty h2')?.textContent ?? null");
check('B-01 #6', 'Empty state explains what to do', !!empty, `heading: "${empty}"`);
await screenshot('b-01-empty-state.png');

// Send with Enter
await typeText('How do we name branches?');
await key();
await settle();
const afterFirst = await evaluate(`(() => {
  const items = [...document.querySelectorAll('.message-list > li')];
  const input = document.querySelector('#composer-input');
  return { n: items.length, lastUser: items.filter(li => li.classList.contains('message--user')).at(-1)?.querySelector('.message__text').textContent,
           value: input.value, focused: document.activeElement === input };
})()`);
check(
  'B-01 #1',
  'Typed message appears at the bottom after sending',
  afterFirst.n === 2 && afterFirst.lastUser === 'How do we name branches?',
  JSON.stringify({ items: afterFirst.n, lastUser: afterFirst.lastUser }),
);
check(
  'B-02 #3',
  'Input cleared and keeps focus after sending',
  afterFirst.value === '' && afterFirst.focused,
  JSON.stringify({ value: afterFirst.value, focused: afterFirst.focused }),
);

// Visual distinction
const styles = await evaluate(`(() => {
  const s = (sel) => { const cs = getComputedStyle(document.querySelector(sel)); return { bg: cs.backgroundColor, align: cs.alignSelf }; };
  return { user: s('.message--user'), assistant: s('.message--assistant') };
})()`);
check(
  'B-01 #2',
  'User and assistant messages visually distinct',
  styles.user.bg !== styles.assistant.bg && styles.user.align !== styles.assistant.align,
  JSON.stringify(styles),
);

// Whitespace-only is blocked
await typeText('   ');
const disabled = await evaluate("document.querySelector('.composer__send').disabled");
await key();
await settle();
check(
  'B-02 #2',
  'Whitespace-only draft: Send disabled and Enter does nothing',
  disabled && (await count()) === 2,
  `disabled=${disabled}, items=${await count()}`,
);
await evaluate(
  "(() => { const i = document.querySelector('#composer-input'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()",
);

// Shift+Enter inserts a new line
await typeText('line one');
await key(8);
await typeText('line two');
const multi = await evaluate("document.querySelector('#composer-input').value");
await key();
await settle();
const lastText = await evaluate(
  "[...document.querySelectorAll('.message--user .message__text')].at(-1).textContent",
);
check(
  'B-02 #1',
  'Shift+Enter inserts a new line, Enter sends',
  multi === 'line one\nline two' && lastText === 'line one\nline two',
  JSON.stringify({ draft: multi, sent: lastText }),
);

// Over-limit block
await typeText('a'.repeat(4001));
const over = await evaluate(
  "({ disabled: document.querySelector('.composer__send').disabled, counter: document.querySelector('.composer__counter').textContent })",
);
check(
  'B-02 #4',
  'Over 4,000 characters is blocked with a visible counter',
  over.disabled && /Too long/.test(over.counter),
  JSON.stringify(over),
);
await evaluate(
  "(() => { const i = document.querySelector('#composer-input'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()",
);

// Fill to 50 messages
while ((await count()) < 50) {
  await typeText(`Question number ${(await count()) / 2 + 1}`);
  await key();
}
await settle();
const atBottom = () =>
  evaluate(
    "(() => { const s = document.querySelector('.chat__scroll'); return { top: Math.round(s.scrollTop), max: s.scrollHeight - s.clientHeight }; })()",
  );
const scroll50 = await atBottom();

// Measure: keydown -> new item painted, with 50 messages in history
await evaluate(`window.__render = new Promise((resolve) => {
  const input = document.querySelector('#composer-input');
  let t0 = 0;
  input.addEventListener('keydown', () => { t0 = performance.now(); }, { capture: true, once: true });
  const list = document.querySelector('.message-list');
  const before = list.children.length;
  new MutationObserver((_, obs) => {
    if (list.children.length > before) { obs.disconnect(); requestAnimationFrame(() => resolve(performance.now() - t0)); }
  }).observe(list, { childList: true });
}); 0`);
await typeText('Message fifty-one, measured');
await key();
const renderMs = await evaluate('window.__render');
await settle();
const scrollAfter = await atBottom();
const total = await count();
check(
  'B-01 #5',
  'With 50 messages, a new send renders in < 100 ms',
  renderMs < 100,
  `${renderMs.toFixed(1)} ms (keydown to next frame, ${total} items after send)`,
);
check(
  'B-01 #3',
  'List auto-scrolls to the newest message',
  scroll50.max > 0 && Math.abs(scrollAfter.top - scrollAfter.max) <= 1,
  `before measured send: ${JSON.stringify(scroll50)}, after: ${JSON.stringify(scrollAfter)}`,
);
check(
  'B-01 #4',
  'Messages persist in the tab (no reload)',
  total === 52,
  `${total} messages present after 26 sends`,
);
await screenshot('b-01-conversation-light.png');

await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'dark' }],
});
await settle();
await screenshot('b-01-conversation-dark.png');

check(
  '—',
  'No console errors or exceptions',
  consoleErrors.length === 0,
  consoleErrors.join(' | ') || 'none',
);

console.log(
  JSON.stringify(
    {
      chrome: (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).Browser,
      results,
    },
    null,
    2,
  ),
);
ws.close();
chrome.kill();
process.exit(results.every((r) => r.pass) ? 0 : 1);
