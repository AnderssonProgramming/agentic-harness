// Verifies the chat in real headless Chrome against the real endpoint.
//   npm run verify:chat [-- <screenshot dir>]        mock engine: deterministic, free, offline-safe
//   npm run verify:chat -- --live [<screenshot dir>]  a five-turn conversation with the engine in .env
// Starts its own dev server. Exits non-zero if any criterion fails.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createReport, openChrome, startApp } from './lib/chrome.mjs';

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const OUT = args.find((arg) => !arg.startsWith('--')) ?? 'docs/evidence';

if (!LIVE) {
  process.env.INFERENCE_ENGINE = 'mock';
  process.env.MOCK_DELAY_MS = '5';
}

const clearInput = `(() => {
  const input = document.querySelector('#composer-input');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`;
const SUGGESTIONS =
  "[...document.querySelectorAll('.chat-empty .starter-questions__button')].map((b) => b.textContent)";
const STATE = `(() => {
  const items = [...document.querySelectorAll('.message-list > li')];
  const replies = items.filter((li) => li.classList.contains('message--assistant'));
  const last = replies.at(-1);
  const input = document.querySelector('#composer-input');
  return {
    items: items.length,
    users: items.length - replies.length,
    lastReply: last ? (last.querySelector('.message__text')?.textContent ?? '') : null,
    lastStatus: last ? ['streaming', 'done', 'error', 'stopped'].find((s) => last.classList.contains('message--' + s)) : null,
    typing: Boolean(document.querySelector('[aria-label="Compass is typing"]')),
    alert: document.querySelector('.message-list > li:last-child [role="alert"]')?.textContent ?? null,
    retry: Boolean(document.querySelector('.message-list > li:last-child .message__retry')),
    stopButton: Boolean(document.querySelector('.composer__send--stop')),
    sendButton: Boolean(document.querySelector('button.composer__send:not(.composer__send--stop)')),
    busy: document.querySelector('.message-list')?.getAttribute('aria-busy') ?? null,
    value: input.value,
    focused: document.activeElement === input,
  };
})()`;

const app = await startApp();
const page = await openChrome();
const { check, finish } = createReport();
const state = () => page.evaluate(STATE);
const say = async (text) => {
  await page.typeText(text);
  await page.pressEnter();
};
const idle = () => page.waitFor("!document.querySelector('.message--streaming')", 60_000);
const newConversation = async () => {
  await page.evaluate("document.querySelector('.new-conversation__button[aria-expanded]').click()");
  await page.waitFor("!!document.querySelector('.new-conversation__button--danger')");
  await page.evaluate("document.querySelector('.new-conversation__button--danger').click()");
  await page.waitFor("!document.querySelector('.message-list')");
};

try {
  await page.setColorScheme('light');
  await page.goto(app.url);
  await page.waitFor("!!document.querySelector('#composer-input')");
  await page.evaluate("document.querySelector('#composer-input').focus()");

  if (LIVE) {
    const turns = [
      'Hi! My name is Lucía and this is my second week as a frontend developer.',
      'Our team uses React with TypeScript. What should I focus on learning first?',
      'Thanks. How do I ask a senior for a code review without bothering them?',
      'What is a good first pull request for someone new?',
      'Before you answer anything else: what is my name, and which stack did I say we use?',
    ];
    const log = [];
    for (const [index, question] of turns.entries()) {
      // Measured in the page: from the Enter keydown to the first painted text of the reply.
      // The trailing "; 0" keeps evaluate() from waiting on the promise.
      await page.evaluate(`window.__firstText = new Promise((resolve) => {
        const input = document.querySelector('#composer-input');
        let t0 = 0;
        input.addEventListener('keydown', () => { t0 = performance.now(); }, { capture: true, once: true });
        new MutationObserver((_, obs) => {
          const text = document.querySelector('.message--assistant:last-child .message__text')?.textContent ?? '';
          if (t0 && text.length > 0) { obs.disconnect(); requestAnimationFrame(() => resolve(Math.round(performance.now() - t0))); }
        }).observe(document.querySelector('.chat__scroll'), { childList: true, subtree: true, characterData: true });
      }); 0`);
      await say(question);
      const firstTextMs = await page.evaluate('window.__firstText');
      await idle();
      const s = await state();
      log.push({
        turn: index + 1,
        question,
        firstTextMs,
        status: s.lastStatus,
        reply: s.lastReply,
      });
      if (index === 0) await page.screenshot(join(OUT, 'b-03-live-streaming.png'));
    }
    const final = log.at(-1);
    check(
      'C1',
      'Every turn gets a complete reply from the model',
      log.every((t) => t.status === 'done' && t.reply.length > 0),
      log.map((t) => `${String(t.turn)}:${t.status}`).join(' '),
    );
    check(
      'C5',
      'Turn 5 remembers turn 1 (name) and turn 2 (stack)',
      /Luc[ií]a/.test(final.reply) && /React/.test(final.reply) && /TypeScript/i.test(final.reply),
      final.reply.slice(0, 200),
    );
    check(
      'B-09',
      'First text appears in under 2 s on every turn',
      log.every((t) => t.firstTextMs < 2000),
      log.map((t) => `${String(t.firstTextMs)} ms`).join(', '),
    );
    check(
      'C6',
      'The whole conversation stays on screen',
      (await state()).items === 10,
      `${String((await state()).items)} messages`,
    );
    await page.screenshot(join(OUT, 'b-03-live-conversation.png'));
    console.error(JSON.stringify(log, null, 2));
  } else {
    // Empty state
    const empty = await page.evaluate(
      "document.querySelector('.chat-empty h2')?.textContent ?? null",
    );
    check('B-01 #6', 'Empty state explains what to do', empty, `heading: "${empty}"`);
    const starters = await page.evaluate(SUGGESTIONS);
    check(
      'B-10 #1',
      'An empty conversation shows the 4 suggested questions',
      starters.length === 4,
      JSON.stringify(starters),
    );

    // Loading, locked send, progressive streaming (slow mock: ~50 ms per word)
    await say('How do we name branches? [mock:slow]');
    const waiting = await state();
    check(
      'C2',
      'A loading indicator is visible while waiting',
      waiting.typing && waiting.busy === 'true',
      JSON.stringify({ typing: waiting.typing, ariaBusy: waiting.busy }),
    );
    check(
      'B-02 #3',
      'Input cleared and keeps focus after sending',
      waiting.value === '' && waiting.focused,
      JSON.stringify({ value: waiting.value, focused: waiting.focused }),
    );
    await page.typeText('A second question');
    await page.pressEnter();
    const blocked = await state();
    check(
      'C3',
      'Send becomes Stop and a second message cannot be sent on top',
      blocked.users === 1 &&
        blocked.stopButton &&
        !blocked.sendButton &&
        blocked.value === 'A second question',
      JSON.stringify({ users: blocked.users, stop: blocked.stopButton, draftKept: blocked.value }),
    );
    await page.screenshot(join(OUT, 'b-03-streaming.png'));
    const lengths = [];
    for (let i = 0; i < 8; i++) {
      lengths.push((await state()).lastReply?.length ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    await idle();
    const done = await state();
    const growth = new Set(lengths.filter((n) => n > 0)).size;
    check(
      'B-09',
      'The reply appears progressively, not all at once',
      growth >= 3 && done.lastStatus === 'done',
      `${String(growth)} distinct lengths while streaming: ${lengths.join(' → ')}`,
    );
    check(
      'C1',
      'The reply arrives under the message',
      done.lastStatus === 'done' && done.lastReply?.includes('How do we name branches?'),
      done.lastReply?.slice(0, 80),
    );
    await page.evaluate(clearInput);

    // Stop keeps the partial text
    await say('Tell me everything about our release process [mock:slow]');
    await page.waitFor(
      "(document.querySelector('.message--assistant:last-child .message__text')?.textContent ?? '').length > 10",
    );
    await page.evaluate("document.querySelector('.composer__send--stop').click()");
    await page.waitFor("!!document.querySelector('.message--stopped')");
    const stopped = await state();
    check(
      'B-09',
      'Stop interrupts the reply and keeps the partial text',
      stopped.lastStatus === 'stopped' &&
        (stopped.lastReply?.length ?? 0) > 10 &&
        stopped.sendButton,
      `${String(stopped.lastReply?.length)} chars kept, status ${stopped.lastStatus}`,
    );

    // Network down: real offline emulation in Chrome
    await page.send('Network.enable');
    await page.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await say('Are you there?');
    await page.waitFor(
      '!!document.querySelector(\'.message-list > li:last-child [role="alert"]\')',
    );
    const offline = await state();
    check(
      'C4',
      'Network down: an understandable error, and the app keeps working',
      /internet connection/.test(offline.alert ?? '') &&
        offline.retry &&
        offline.sendButton &&
        offline.users === 3,
      JSON.stringify({ alert: offline.alert, retry: offline.retry, usersKept: offline.users }),
    );
    await page.screenshot(join(OUT, 'b-05-network-error.png'));
    await page.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await page.evaluate("document.querySelector('.message__retry').click()");
    await idle();
    const recovered = await state();
    check(
      'B-05',
      'Retry after reconnecting gets the reply, and the user message was kept',
      recovered.lastStatus === 'done' &&
        recovered.lastReply?.includes('Are you there?') &&
        recovered.alert === null,
      recovered.lastReply?.slice(0, 60),
    );

    // API errors name the cause; Retry only when it can help
    await say('Hello [mock:rate_limit]');
    await page.waitFor(
      '!!document.querySelector(\'.message-list > li:last-child [role="alert"]\')',
    );
    const limited = await state();
    await say('Hello [mock:auth]');
    await page.waitFor(
      "(document.querySelector('.message-list > li:last-child [role=\"alert\"]')?.textContent ?? '').includes('API key')",
    );
    const auth = await state();
    check(
      'B-05',
      'API errors are explained; Retry only when retrying can help',
      /Too many requests/.test(limited.alert ?? '') &&
        limited.retry &&
        /rejected the API key/.test(auth.alert ?? '') &&
        !auth.retry,
      JSON.stringify({ rateLimit: limited.alert, authRetry: auth.retry }),
    );

    // Visual distinction, keyboard behaviour, limits
    const styles = await page.evaluate(`(() => {
      const s = (sel) => { const cs = getComputedStyle(document.querySelector(sel)); return { bg: cs.backgroundColor, align: cs.alignSelf }; };
      return { user: s('.message--user'), assistant: s('.message--assistant.message--done') };
    })()`);
    check(
      'B-01 #2',
      'User and assistant messages are visually distinct',
      styles.user.bg !== styles.assistant.bg && styles.user.align !== styles.assistant.align,
      JSON.stringify(styles),
    );
    const before = (await state()).users;
    await page.typeText('   ');
    await page.pressEnter();
    check(
      'B-02 #2',
      'Whitespace-only drafts are not sent',
      (await state()).users === before,
      `users ${String(before)} → ${String((await state()).users)}`,
    );
    await page.evaluate(clearInput);
    await page.typeText('line one');
    await page.pressEnter(8);
    await page.typeText('line two');
    const multi = (await state()).value;
    check(
      'B-02 #1',
      'Shift+Enter inserts a new line',
      multi === 'line one\nline two',
      JSON.stringify(multi),
    );
    await page.evaluate(clearInput);
    await page.typeText('a'.repeat(4001));
    const over = await page.evaluate(
      "({ disabled: document.querySelector('button.composer__send').disabled, counter: document.querySelector('.composer__counter').textContent })",
    );
    check(
      'B-02 #4',
      'Over 4,000 characters is blocked with a visible counter',
      over.disabled && /Too long/.test(over.counter),
      JSON.stringify(over),
    );
    await page.evaluate(clearInput);

    // Starter questions come back after "New conversation", and one click sends and streams (B-10)
    await newConversation();
    const restored = await page.evaluate(SUGGESTIONS);
    check(
      'B-10 #3',
      'Suggestions come back after "New conversation"',
      restored.length === 4,
      `${String(restored.length)} suggestions`,
    );
    await page.evaluate(`window.__sawStreaming = false;
      new MutationObserver((_, obs) => {
        if (document.querySelector('.message--streaming')) { window.__sawStreaming = true; obs.disconnect(); }
      }).observe(document.querySelector('.chat__scroll'), { childList: true, subtree: true }); 0`);
    const picked = restored[1];
    await page.evaluate(
      `[...document.querySelectorAll('.starter-questions__button')].find((b) => b.textContent === ${JSON.stringify(picked)}).click()`,
    );
    await page.waitFor("!!document.querySelector('.message--assistant')");
    await idle();
    const sent = await page.evaluate(`({
      users: [...document.querySelectorAll('.message--user .message__text')].map((p) => p.textContent),
      sawStreaming: window.__sawStreaming,
      suggestions: document.querySelectorAll('.starter-questions__button').length,
    })`);
    const afterPick = await state();
    check(
      'B-10 #2',
      'Clicking a suggestion sends it as a user message and a reply streams (mock engine)',
      sent.users.length === 1 &&
        sent.users[0] === picked &&
        sent.sawStreaming &&
        afterPick.lastStatus === 'done' &&
        afterPick.lastReply?.includes(picked) &&
        sent.suggestions === 0 &&
        afterPick.focused,
      JSON.stringify({
        users: sent.users,
        sawStreaming: sent.sawStreaming,
        status: afterPick.lastStatus,
        suggestionsLeft: sent.suggestions,
        inputFocused: afterPick.focused,
      }),
    );

    // Cited sources (B-07): the mock cites the document it matched, plus an invented name
    await page.evaluate("document.querySelector('#composer-input').focus()");
    await say('What is our branch naming convention? [mock:unknown_source]');
    await idle();
    // Chips appear once the list of loaded documents has arrived; wait for that state first,
    // so the "not clickable" check below can't pass early.
    await page.waitFor("!!document.querySelector('.message--assistant:last-child .source-chip')");
    const chips = await page.evaluate(`(() => {
      const reply = document.querySelector('.message--assistant:last-child');
      return {
        text: reply.querySelector('.message__text')?.textContent ?? '',
        buttons: [...reply.querySelectorAll('button.source-chip')].map((b) => b.textContent),
        unverified: [...reply.querySelectorAll('.source-chip--unverified')].map((s) => s.textContent),
      };
    })()`);
    check(
      'B-07 #1',
      'A knowledge answer ends with its source as a chip, and the raw Sources line is gone',
      JSON.stringify(chips.buttons) === '["branch-naming.md"]' && !/Sources:/.test(chips.text),
      JSON.stringify({ buttons: chips.buttons }),
    );
    check(
      'B-07 #3',
      'An invented source is shown as "not a known document" and is not clickable',
      JSON.stringify(chips.unverified) === '["invented-guide.md (not a known document)"]',
      JSON.stringify(chips.unverified),
    );
    await page.evaluate(
      "document.querySelector('.message--assistant:last-child button.source-chip').click()",
    );
    await page.waitFor("!!document.querySelector('.source-panel .source-panel__text')");
    const onDisk = readFileSync('knowledge/branch-naming.md', 'utf8').replace(/\r/g, '');
    const panel = await page.evaluate(`(() => {
      const panel = document.querySelector('.source-panel');
      return {
        text: panel.querySelector('.source-panel__text').textContent.replace(/\\r/g, ''),
        html: panel.querySelectorAll('.source-panel__text *').length,
        focusInside: panel.contains(document.activeElement),
        title: panel.querySelector('.source-panel__title')?.textContent ?? '',
      };
    })()`);
    check(
      'B-07 #2',
      "Clicking the chip shows the file's content as plain text in a side panel, with focus inside",
      panel.text === onDisk && panel.html === 0 && panel.focusInside,
      JSON.stringify({
        title: panel.title,
        chars: panel.text.length,
        focusInside: panel.focusInside,
      }),
    );
    const viewport = await page.evaluate('({ w: innerWidth, h: innerHeight })');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 700,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.settle();
    const narrow = await page.evaluate(`(() => {
      const p = document.querySelector('.source-panel').getBoundingClientRect();
      const c = document.querySelector('.chat').getBoundingClientRect();
      return {
        covers: Math.abs(p.left - c.left) <= 1 && Math.abs(p.right - c.right) <= 1 &&
          Math.abs(p.top - c.top) <= 1 && Math.abs(p.bottom - c.bottom) <= 1,
        animation: getComputedStyle(document.querySelector('.source-panel')).animationName,
      };
    })()`);
    await page.screenshot(join(OUT, 'b-07-source-panel-narrow.png'));
    check(
      'B-07 #2',
      'On a narrow screen the panel covers the chat; no motion under prefers-reduced-motion',
      narrow.covers && narrow.animation === 'none',
      JSON.stringify(narrow),
    );
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.w,
      height: viewport.h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.setColorScheme('light');
    await page.settle();
    await page.screenshot(join(OUT, 'b-07-source-panel.png'));
    const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...escape });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...escape });
    await page.waitFor("!document.querySelector('.source-panel')");
    const returned = await page.evaluate(
      "document.activeElement?.matches('.message--assistant:last-child button.source-chip') ?? false",
    );
    check(
      'B-07 #2',
      'Escape closes the panel and focus returns to the chip',
      returned,
      `focus on chip: ${String(returned)}`,
    );

    // Five turns with context, in a fresh conversation (a reload restores the chat since B-08)
    await newConversation();
    await page.evaluate("document.querySelector('#composer-input').focus()");
    for (let i = 1; i <= 5; i++) {
      await say(`Context question ${String(i)}`);
      await idle();
    }
    const five = await state();
    const counted = Number(/received (\d+) of your messages/.exec(five.lastReply ?? '')?.[1] ?? 0);
    check(
      'C5',
      'Five turns: on turn 5 the model receives all five user messages',
      counted === 5 && five.users === 5,
      `model received ${String(counted)} user messages; ${String(five.users)} on screen`,
    );

    // Fill to 50 messages and measure a send
    while ((await state()).items < 50) {
      await say(`Filler ${String((await state()).items)}`);
      await idle();
    }
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
    await say('Message fifty-one, measured');
    const renderMs = await page.evaluate('window.__render');
    await idle();
    const atBottom = await page.evaluate(
      "(() => { const s = document.querySelector('.chat__scroll'); return Math.abs(s.scrollTop - (s.scrollHeight - s.clientHeight)) <= 2; })()",
    );
    const final = await state();
    check(
      'B-01 #5',
      'With 50 messages, a new send renders in < 100 ms',
      renderMs < 100,
      `${renderMs.toFixed(1)} ms`,
    );
    check(
      'B-01 #3',
      'The list follows the newest message',
      atBottom,
      `at bottom: ${String(atBottom)}`,
    );
    check(
      'C6',
      'The history stays while the app is open',
      final.items >= 52,
      `${String(final.items)} messages on screen`,
    );
    await page.screenshot(join(OUT, 'b-03-conversation-light.png'));
    await page.setColorScheme('dark');
    await page.settle();
    await page.screenshot(join(OUT, 'b-03-conversation-dark.png'));
  }

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

process.exitCode = finish({ chrome: page.browserVersion, mode: LIVE ? 'live' : 'mock' });
