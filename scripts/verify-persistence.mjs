// Verifies B-08 in real headless Chrome on the mock engine: the conversation survives closing the
// browser and starting it again on the same profile, New conversation clears it, and blocked, full
// or corrupted storage never breaks the chat.
//   npm run verify:persistence
// Starts its own dev server. Exits non-zero if any criterion fails.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReport, openChrome, startApp } from './lib/chrome.mjs';

process.env.INFERENCE_ENGINE = 'mock';
// A "[mock:slow]" reply waits ten times this per word, so it is still streaming after a second.
process.env.MOCK_DELAY_MS = '20';

const KEY = 'compass.conversation';
const MESSAGES = `[...document.querySelectorAll('.message-list > li')].map((li) => ({
  author: li.classList.contains('message--user') ? 'user' : 'assistant',
  status: ['streaming', 'done', 'error', 'stopped'].find((s) => li.classList.contains('message--' + s)),
  text: li.querySelector('.message__text')?.textContent ?? '',
  alert: li.querySelector('[role="alert"]')?.textContent ?? null,
}))`;
const NOTICE = "document.querySelector('.storage-notice')?.textContent ?? null";
const TRIGGER = '.new-conversation__button[aria-expanded]';
// Injected before the app's code runs, as a browser that blocks storage or has no space left.
const BLOCKED = `Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get() { throw new DOMException('Storage is disabled', 'SecurityError'); },
});`;
const FULL = `Storage.prototype.setItem = function () {
  throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
};`;

const app = await startApp();
const profileDir = mkdtempSync(join(tmpdir(), 'compass-persistence-'));
const { check, finish } = createReport();
const consoleErrors = [];
let browserVersion;
let page;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const messages = () => page.evaluate(MESSAGES);
const notice = () => page.evaluate(NOTICE);
const click = (selector) =>
  page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const summary = (list) => list.map((m) => `${m.author}:${m.status}`).join(' ') || 'empty';

async function load() {
  await page.goto(app.url);
  await page.waitFor("!!document.querySelector('#composer-input')");
  await page.evaluate("document.querySelector('#composer-input').focus()");
}

// Starts Chrome on the kept profile (or a throwaway one), with an optional script run before the app.
async function open({ keepProfile = true, script } = {}) {
  page = await openChrome(keepProfile ? { profileDir } : {});
  browserVersion = page.browserVersion;
  if (script) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: script });
  await load();
}

async function close() {
  consoleErrors.push(...page.consoleErrors);
  await page.close();
  page = undefined;
}

// Sends a message and waits for its reply to settle, whatever the outcome.
async function ask(text) {
  const before = (await messages()).length;
  await page.typeText(text);
  await page.pressEnter();
  await page.waitFor(
    `document.querySelectorAll('.message-list > li').length === ${String(before + 2)} && !document.querySelector('.message--streaming')`,
    30_000,
  );
}

async function openConfirmation() {
  await click(TRIGGER);
  await page.waitFor("!!document.querySelector('.new-conversation__confirm')");
}

try {
  // (a) Two messages, one answered and one failed, survive a full browser restart.
  await open();
  await ask('How do we name branches?');
  await ask('Hello [mock:rate_limit]');
  const beforeClose = await messages();
  await close();
  await open();
  const reopened = await messages();
  const reopenedNotice = await notice();
  check(
    'Survives a real close',
    'After closing Chrome and starting it on the same profile, the conversation is back',
    reopened.length === 4,
    `${String(beforeClose.length)} messages before close, ${String(reopened.length)} after restart`,
  );
  check(
    'Automatic / Order and state',
    'Saved with no user action; same order, authors, text, status and error, and no notice',
    JSON.stringify(reopened) === JSON.stringify(beforeClose) &&
      reopened[1]?.status === 'done' &&
      reopened[3]?.status === 'error' &&
      reopenedNotice === null,
    `${summary(reopened)}; notice: ${String(reopenedNotice)}`,
  );

  // (b) Closing the browser in the middle of a reply.
  await page.typeText('Tell me everything about our release process [mock:slow]');
  await page.pressEnter();
  await page.waitFor(
    "(document.querySelector('.message--streaming .message__text')?.textContent ?? '').length > 0",
  );
  await sleep(1_500); // past the 1 s interval at which streamed text is saved
  const atClose = (await messages()).at(-1);
  await close();
  await open();
  const afterCrash = await messages();
  const restored = afterCrash.at(-1);
  check(
    'Order and state',
    'A reply still streaming at close comes back stopped with its partial text',
    atClose?.status === 'streaming' &&
      afterCrash.length === 6 &&
      restored?.status === 'stopped' &&
      restored.text.length > 0 &&
      atClose.text.startsWith(restored.text),
    `${String(atClose?.status)} → ${String(restored?.status)}; ${String(restored?.text.length)} of ${String(atClose?.text.length)} chars on screen at close were saved`,
  );

  // (c) New conversation: Cancel keeps it, Clear empties it, and it stays empty after a restart.
  await openConfirmation();
  await click(
    '.new-conversation__confirm .new-conversation__button:not(.new-conversation__button--danger)',
  );
  const afterCancel = (await messages()).length;
  await openConfirmation();
  await click('.new-conversation__button--danger');
  await page.waitFor("!document.querySelector('.message-list')");
  const storedAfterClear = await page.evaluate(`localStorage.getItem('${KEY}')`);
  await close();
  await open();
  const cleared = await page.evaluate(
    `({ items: document.querySelectorAll('.message-list > li').length, emptyState: !!document.querySelector('.chat-empty'), buttonDisabled: document.querySelector('${TRIGGER}').disabled })`,
  );
  check(
    'Clear history',
    'Cancel keeps everything; Clear empties screen and storage, still empty after a restart',
    afterCancel === 6 &&
      storedAfterClear === null &&
      cleared.items === 0 &&
      cleared.emptyState &&
      cleared.buttonDisabled,
    JSON.stringify({ afterCancel, storedAfterClear, afterRestart: cleared }),
  );
  await close();

  // (d) and (e) Storage the browser blocks, or that is full: the chat keeps working and says so.
  for (const [name, script, expected] of [
    ['Blocked storage', BLOCKED, /blocking storage.*won't be saved/],
    ['Full storage', FULL, /storage is full.*won't be saved/],
  ]) {
    await open({ keepProfile: false, script });
    await ask('Can you still answer me?');
    const reply = (await messages()).at(-1);
    const shown = await notice();
    check(
      'Storage failure',
      `${name}: the chat still answers and shows that the conversation won't be saved`,
      reply?.status === 'done' &&
        reply.text.includes('Can you still answer me?') &&
        expected.test(shown ?? ''),
      `reply ${String(reply?.status)}; notice: ${String(shown)}`,
    );
    await close();
  }

  // (f) A corrupted stored value: an empty chat that says so once.
  await open({ keepProfile: false });
  await page.evaluate(`localStorage.setItem('${KEY}', '{"version":1,"messages":[{"broken"')`);
  await load();
  const first = {
    items: (await messages()).length,
    notice: await notice(),
    stored: await page.evaluate(`localStorage.getItem('${KEY}')`),
  };
  await load();
  const second = await notice();
  check(
    'Bad data',
    'Corrupted data gives an empty chat with a notice, is removed, and a reload shows no notice',
    first.items === 0 &&
      /couldn't be restored.*started a new one/.test(first.notice ?? '') &&
      first.stored === null &&
      second === null,
    JSON.stringify({ ...first, noticeAfterReload: second }),
  );
  await close();

  check(
    '—',
    'No console errors or exceptions',
    consoleErrors.length === 0,
    consoleErrors.join(' | ') || 'none',
  );
} catch (error) {
  check('—', 'Script completed', false, error instanceof Error ? error.message : String(error));
} finally {
  if (page) await page.close();
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 3 });
  await app.close();
}

process.exitCode = finish({ chrome: browserVersion, mode: 'mock' });
