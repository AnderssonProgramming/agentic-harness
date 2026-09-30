// Verifies the B-01 and B-02 acceptance criteria in real headless Chrome.
// Usage: npm run verify:chat [-- <screenshot dir>]   (starts its own dev server; set APP_URL to reuse one)
// Exits non-zero if any criterion fails.
import { join } from 'node:path';
import { createReport, openChrome, startApp } from './lib/chrome.mjs';

const OUT = process.argv[2] ?? 'docs/evidence';
const clearInput = `(() => {
  const input = document.querySelector('#composer-input');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`;

const app = await startApp();
const page = await openChrome();
const { check, finish } = createReport();
const count = () => page.evaluate("document.querySelectorAll('.message-list > li').length");

try {
  await page.setColorScheme('light');
  await page.goto(app.url);
  await page.waitFor("!!document.querySelector('#composer-input')");
  await page.evaluate("document.querySelector('#composer-input').focus()");

  // Empty state
  const empty = await page.evaluate(
    "document.querySelector('.chat-empty h2')?.textContent ?? null",
  );
  check('B-01 #6', 'Empty state explains what to do', empty, `heading: "${empty}"`);
  await page.screenshot(join(OUT, 'b-01-empty-state.png'));

  // Send with Enter
  await page.typeText('How do we name branches?');
  await page.pressEnter();
  await page.settle();
  const afterFirst = await page.evaluate(`(() => {
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
  const styles = await page.evaluate(`(() => {
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
  await page.typeText('   ');
  const disabled = await page.evaluate("document.querySelector('.composer__send').disabled");
  await page.pressEnter();
  await page.settle();
  const afterBlank = await count();
  check(
    'B-02 #2',
    'Whitespace-only draft: Send disabled and Enter does nothing',
    disabled && afterBlank === 2,
    `disabled=${disabled}, items=${afterBlank}`,
  );
  await page.evaluate(clearInput);

  // Shift+Enter inserts a new line
  await page.typeText('line one');
  await page.pressEnter(8);
  await page.typeText('line two');
  const multi = await page.evaluate("document.querySelector('#composer-input').value");
  await page.pressEnter();
  await page.settle();
  const lastText = await page.evaluate(
    "[...document.querySelectorAll('.message--user .message__text')].at(-1).textContent",
  );
  check(
    'B-02 #1',
    'Shift+Enter inserts a new line, Enter sends',
    multi === 'line one\nline two' && lastText === 'line one\nline two',
    JSON.stringify({ draft: multi, sent: lastText }),
  );

  // Over-limit block
  await page.typeText('a'.repeat(4001));
  const over = await page.evaluate(
    "({ disabled: document.querySelector('.composer__send').disabled, counter: document.querySelector('.composer__counter').textContent })",
  );
  check(
    'B-02 #4',
    'Over 4,000 characters is blocked with a visible counter',
    over.disabled && /Too long/.test(over.counter),
    JSON.stringify(over),
  );
  await page.evaluate(clearInput);

  // Fill to 50 messages
  while ((await count()) < 50) {
    await page.typeText(`Question number ${(await count()) / 2 + 1}`);
    await page.pressEnter();
  }
  await page.settle();
  const atBottom = () =>
    page.evaluate(
      "(() => { const s = document.querySelector('.chat__scroll'); return { top: Math.round(s.scrollTop), max: s.scrollHeight - s.clientHeight }; })()",
    );
  const scroll50 = await atBottom();

  // Measure keydown -> new item painted, with 50 messages in the history.
  // The trailing "; 0" matters: returning the promise itself would make evaluate() wait on it.
  await page.evaluate(`window.__render = new Promise((resolve) => {
    const input = document.querySelector('#composer-input');
    let t0 = 0;
    input.addEventListener('keydown', () => { t0 = performance.now(); }, { capture: true, once: true });
    const list = document.querySelector('.message-list');
    const before = list.children.length;
    new MutationObserver((_, obs) => {
      if (list.children.length > before) { obs.disconnect(); requestAnimationFrame(() => resolve(performance.now() - t0)); }
    }).observe(list, { childList: true });
  }); 0`);
  await page.typeText('Message fifty-one, measured');
  await page.pressEnter();
  const renderMs = await page.evaluate('window.__render');
  await page.settle();
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
  await page.screenshot(join(OUT, 'b-01-conversation-light.png'));

  await page.setColorScheme('dark');
  await page.settle();
  await page.screenshot(join(OUT, 'b-01-conversation-dark.png'));

  check(
    '—',
    'No console errors or exceptions',
    page.consoleErrors.length === 0,
    page.consoleErrors.join(' | ') || 'none',
  );
} catch (error) {
  check('—', 'Script completed', false, error instanceof Error ? error.message : String(error));
} finally {
  await page.close();
  await app.close();
}

process.exitCode = finish({ chrome: page.browserVersion });
