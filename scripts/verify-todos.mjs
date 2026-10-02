// Verifies B-11 in real headless Chrome on the mock engine: chat phrases add, list and complete
// to-dos in storage, the cards come from stored data, failures change nothing, and to-dos and
// cards survive closing the browser. Amendment 1: several actions in one reply, the reset notice
// for unreadable to-do data, and an engine without tool calling (MOCK_TOOLS=off): standing notice,
// app refusal, storage byte-identical. Storage is read and written through the DevTools protocol
// (DOMStorage), never through the page, so a page that blocks or breaks storage can't fake it.
//   npm run verify:todos            deterministic, on the mock engine
//   npm run verify:todos -- --live  with the engine in .env: add, complete, list, context and
//                                   restart; or, for an engine without tool calling (Ollama),
//                                   the notice, the refusal and an ordinary reply
//   npm run verify:todos -- --live --engine=ollama   the same, overriding INFERENCE_ENGINE
// Starts its own dev servers. Exits non-zero if any criterion fails.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReport, openChrome, startApp } from './lib/chrome.mjs';

const LIVE = process.argv.includes('--live');
// --engine=<name> overrides INFERENCE_ENGINE from .env for a live run, e.g. --engine=ollama.
const ENGINE = process.argv.find((arg) => arg.startsWith('--engine='))?.slice('--engine='.length);
if (LIVE && ENGINE) process.env.INFERENCE_ENGINE = ENGINE;
if (!LIVE) {
  process.env.INFERENCE_ENGINE = 'mock';
  // After an action the mock waits one pause; "[mock:slow]" makes it 10 × 50 ms, long enough to see.
  process.env.MOCK_DELAY_MS = '50';
}

const TODOS = 'compass.todos';
const CONVERSATION = 'compass.conversation';
const CARDS = `[...document.querySelectorAll('.todo-card')].map((card) => ({
  kind: card.dataset.card,
  tone: [...card.classList].find((c) => c.startsWith('todo-card--'))?.slice('todo-card--'.length),
  title: card.querySelector('.todo-card__title')?.textContent ?? '',
  items: [...card.querySelectorAll('.todo-card__item')].map((li) => ({
    text: li.textContent,
    done: li.classList.contains('todo-card__item--done'),
  })),
  modelText: card.closest('li')?.querySelector('.message__text')?.textContent ?? null,
}))`;
const LAST_REPLY =
  "document.querySelector('.message-list > li:last-child .message__text')?.textContent ?? ''";
const BLOCKED = `Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get() { throw new DOMException('Storage is disabled', 'SecurityError'); },
});`;
const FULL = `Storage.prototype.setItem = function () {
  throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
};`;

let app = await startApp();
let origin = new URL(app.url).origin;
const profileDir = mkdtempSync(join(tmpdir(), 'compass-todos-'));
const { check, finish } = createReport();
const consoleErrors = [];
let browserVersion;
let page;

const cards = () => page.evaluate(CARDS);
const lastCard = async () => (await cards()).at(-1);
const userCount = () => page.evaluate("document.querySelectorAll('.message--user').length");
// A to-do notice ("engine" or "reset"): its text, and whether it is shown.
const notice = (name) =>
  page.evaluate(`(() => {
    const el = document.querySelector('[data-notice="${name}"]');
    return { text: el?.textContent ?? '', shown: !!el && el.classList.contains('todo-notice') };
  })()`);
// Waits for a notice to show. On timeout it returns the notice's last state with a message,
// so the check fails with a reason instead of aborting the script.
async function noticeShown(name, timeoutMs = 10_000) {
  try {
    await page.waitFor(
      `document.querySelector('[data-notice="${name}"]')?.classList.contains('todo-notice') === true`,
      timeoutMs,
    );
  } catch {
    const last = await notice(name);
    return {
      ...last,
      timedOut: `the "${name}" notice did not show within ${String(timeoutMs)} ms (last text: "${last.text}")`,
    };
  }
  return notice(name);
}
// Env is read when the dev server starts, so switching the engine means a new server.
async function restartApp(env) {
  await app.close();
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  app = await startApp();
  origin = new URL(app.url).origin;
}

const storageId = () => ({ securityOrigin: origin, isLocalStorage: true });

// Reads localStorage from outside the page.
async function stored(key) {
  const { entries } = await page.send('DOMStorage.getDOMStorageItems', { storageId: storageId() });
  const hit = entries.find(([name]) => name === key);
  return hit ? hit[1] : null;
}

// Writes localStorage from outside the page, then reloads it so the app reads it at start.
async function seedAndReload(key, value) {
  await page.send('DOMStorage.setDOMStorageItem', { storageId: storageId(), key, value });
  await reload();
}

async function reload() {
  await page.evaluate('window.__beforeReload = true');
  await page.goto(app.url);
  await page.waitFor("!window.__beforeReload && !!document.querySelector('#composer-input')");
  await page.evaluate("document.querySelector('#composer-input').focus()");
}

const SEEDED_TODOS = JSON.stringify({
  version: 1,
  todos: [
    { id: 's1', text: 'read the onboarding doc', done: false, createdAt: 1, doneAt: null },
    { id: 's2', text: 'set up the VPN', done: true, createdAt: 2, doneAt: 3 },
  ],
});

// Amendment 2: holds back the page's GET /api/engine response, so the app renders (composer
// ready) well before it knows the engine. Forces the ordering that made the notice check flaky.
const ENGINE_INFO_DELAY_MS = 1_500;
const delayEngineInfo = (ms) => `(() => {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const response = realFetch(input, init);
    if (new URL(url, location.href).pathname !== '/api/engine') return response;
    return response.then((r) => new Promise((resolve) => setTimeout(() => resolve(r), ${String(ms)})));
  };
})()`;

/**
 * Amendment 1 (a): with an engine that can't run actions, the standing notice shows, to-do
 * phrases get the app's refusal with storage byte-identical, and other wording reaches the model.
 */
async function engineWithoutActions(label, replyTimeoutMs, { engineInfoDelayMs = 0 } = {}) {
  await open({
    keepProfile: false,
    script: engineInfoDelayMs > 0 ? delayEngineInfo(engineInfoDelayMs) : undefined,
  });
  await page.waitFor(
    "document.querySelector('[data-notice=\"engine\"]')?.classList.contains('todo-notice')",
  );
  await seedAndReload(TODOS, SEEDED_TODOS);
  // The composer renders before GET /api/engine answers, so wait for the notice, never read once.
  const shown = await noticeShown('engine');
  check(
    'No tool calling: notice',
    `${label}: the standing notice says the list can't be changed and saved to-dos are safe`,
    shown.shown &&
      shown.text ===
        "Compass can't change your to-do list with the current engine. Your saved to-dos are safe.",
    shown.timedOut ?? shown.text,
  );

  const before = await stored(TODOS);
  await ask('Remind me to ask Ana how deploys work.');
  const refusal = await lastCard();
  const afterAdd = await stored(TODOS);
  await ask("What's on my list?");
  const listRefusal = await lastCard();
  const afterList = await stored(TODOS);
  const replyItems = await page.evaluate(
    "[...document.querySelectorAll('.message--assistant')].map((li) => li.querySelector('.message__text')?.textContent ?? null)",
  );
  check(
    'No tool calling: refusal',
    `${label}: a to-do phrase gets the app's message (not done, and why), no model text, and storage is byte-identical`,
    refusal?.kind === 'unsupported' &&
      refusal.title ===
        "Not added: the current engine can't run to-do actions, so Compass didn't touch your list." &&
      refusal.modelText === null &&
      listRefusal?.kind === 'unsupported' &&
      /^Not shown:/.test(listRefusal.title) &&
      replyItems.every((text) => text === null) &&
      before === SEEDED_TODOS &&
      afterAdd === before &&
      afterList === before,
    `${refusal?.title} | ${listRefusal?.title} | storage identical: ${String(afterAdd === before && afterList === before)}`,
  );

  await ask('How do we name branches? Answer in one short sentence.', replyTimeoutMs);
  const reply = await page.evaluate(LAST_REPLY);
  check(
    'No tool calling: other wording',
    `${label}: an ordinary question still reaches the model, and the notice stays`,
    reply.trim() !== '' &&
      (await cards()).length === 2 &&
      (await notice('engine')).shown &&
      (await stored(TODOS)) === before,
    reply.slice(0, 120),
  );
  await close();
}
const storedTodos = async () => {
  const raw = await stored(TODOS);
  return raw === null ? null : JSON.parse(raw).todos;
};

async function open({ keepProfile = true, script } = {}) {
  page = await openChrome(keepProfile ? { profileDir } : {});
  browserVersion = page.browserVersion;
  await page.send('DOMStorage.enable');
  if (script) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: script });
  await page.goto(app.url);
  await page.waitFor("!!document.querySelector('#composer-input')");
  await page.evaluate("document.querySelector('#composer-input').focus()");
}

async function close() {
  consoleErrors.push(...page.consoleErrors);
  await page.close();
  page = undefined;
}

async function ask(text, timeoutMs = 30_000) {
  const before = await page.evaluate("document.querySelectorAll('.message-list > li').length");
  await page.typeText(text);
  await page.pressEnter();
  await page.waitFor(
    `document.querySelectorAll('.message-list > li').length === ${String(before + 2)} && !document.querySelector('.message--streaming')`,
    timeoutMs,
  );
}

// A live engine without tool calling (Ollama) gets only the Amendment 1 scenario.
const LIVE_NO_ACTIONS =
  LIVE && (await (await fetch(new URL('/api/engine', app.url))).json()).actions === false;

try {
  if (LIVE_NO_ACTIONS) {
    // CPU-only local models can take about 20 s per reply; allow plenty.
    await engineWithoutActions(`Live (${process.env.INFERENCE_ENGINE ?? '.env'})`, 180_000);
  } else {
    await open();
    const startNotice = await notice('engine');
    check(
      'No tool calling: notice',
      'With an engine that can run actions, the engine notice is not shown',
      !startNotice.shown && startNotice.text === '',
      JSON.stringify(startNotice),
    );

    // List, empty.
    await ask("What's on my list?");
    const empty = await lastCard();
    const emptyStored = await storedTodos();
    check(
      'List',
      'An empty list says it is empty',
      empty?.kind === 'listed' && empty.title === 'Your list is empty.' && emptyStored === null,
      `card: ${empty?.title}; stored: ${JSON.stringify(emptyStored)}`,
    );

    // Add.
    await ask('Remind me to ask Ana how deploys work');
    const afterAdd = await storedTodos();
    const addCard = await lastCard();
    check(
      'Add',
      'A new open to-do is stored, and the confirmation is built from the stored item',
      afterAdd?.length === 1 &&
        // A live model words the to-do itself; the criterion asks for "that meaning".
        (LIVE
          ? /\bAna\b/i.test(afterAdd[0].text) && /deploy/i.test(afterAdd[0].text)
          : afterAdd[0].text === 'ask Ana how deploys work') &&
        afterAdd[0].done === false &&
        addCard?.kind === 'added' &&
        addCard.title === `Added to your list: ${afterAdd[0].text}`,
      `stored: ${JSON.stringify(afterAdd)}; card: ${addCard?.title}`,
    );
    await ask('Add read the onboarding doc to my list');

    // Complete.
    await ask('Mark the deploy one as done');
    const afterComplete = await storedTodos();
    const completeCard = await lastCard();
    check(
      'Complete',
      'The matching stored to-do becomes done, the other is untouched, and the card names it',
      afterComplete?.length === 2 &&
        afterComplete[0].done === true &&
        afterComplete[1].done === false &&
        completeCard?.kind === 'completed' &&
        completeCard.title === `Marked as done: ${afterComplete[0].text}`,
      `stored: ${JSON.stringify(afterComplete.map((t) => [t.text, t.done]))}; card: ${completeCard?.title}`,
    );

    // List, with items.
    await ask("What's on my list?");
    const listCard = await lastCard();
    const listStored = await storedTodos();
    const expectedItems = [
      ...listStored.filter((t) => !t.done).map((t) => ({ text: t.text, done: false })),
      ...listStored.filter((t) => t.done).map((t) => ({ text: `Done: ${t.text}`, done: true })),
    ];
    const openCount = listStored.filter((t) => !t.done).length;
    check(
      'List',
      'The card shows exactly the stored to-dos, open first, done ones marked, with the stored count',
      listCard?.kind === 'listed' &&
        JSON.stringify(listCard.items) === JSON.stringify(expectedItems) &&
        listCard.title ===
          `Your list has ${String(listStored.length)} to-dos, ${String(openCount)} open:`,
      `card: ${listCard?.title} ${JSON.stringify(listCard?.items)}`,
    );

    if (LIVE) {
      const live = await cards();
      check(
        'The model never claims success itself',
        'Every reply with an action shows only the app card, with no model text',
        live.length === 5 && live.every((card) => card.modelText === null),
        `${String(live.length)} cards: ${live.map((c) => c.kind).join(', ')}`,
      );
      await ask('Who did I want to ask about deploys? Answer in one short sentence.');
      const answer = await page.evaluate(LAST_REPLY);
      check(
        "Doesn't break the chat",
        'After actions, an ordinary question gets an ordinary reply that uses the conversation',
        /Ana/.test(answer) && (await cards()).length === live.length,
        answer.slice(0, 120),
      );
      const before = await cards();
      const todosBefore = await stored(TODOS);
      await close();
      await open();
      check(
        'Survives a restart',
        'After closing and reopening Chrome, the stored to-dos and the cards are unchanged',
        todosBefore !== null &&
          (await stored(TODOS)) === todosBefore &&
          JSON.stringify(await cards()) === JSON.stringify(before),
        `${String(before.length)} cards`,
      );
      await close();
    } else {
      // Ambiguous and no match: nothing changes, Compass asks.
      await ask('Remind me to read the deploy guide');
      await ask('Remind me to check the deploy checklist');
      const beforeAsk = await stored(TODOS);
      await ask('Mark the deploy one as done');
      const ambiguous = await lastCard();
      await ask('Mark the coffee one as done');
      const noMatch = await lastCard();
      const afterAsk = await stored(TODOS);
      check(
        'Complete',
        'Several matches or none: storage is unchanged and Compass asks which one',
        ambiguous?.kind === 'ambiguous' &&
          ambiguous.items.length === 2 &&
          /Which one do you mean\?/.test(ambiguous.title) &&
          noMatch?.kind === 'no-match' &&
          /Which one do you mean\?/.test(noMatch.title) &&
          afterAsk === beforeAsk,
        `${ambiguous?.title} (${String(ambiguous?.items.length)} candidates); ${noMatch?.title}; storage unchanged: ${String(afterAsk === beforeAsk)}`,
      );

      // The model's text never stands for a confirmation.
      const allCards = await cards();
      check(
        'The model never claims success itself',
        'Every reply with an action shows only the app card, with no model text',
        allCards.length === 9 && allCards.every((card) => card.modelText === null),
        `${String(allCards.length)} cards; model text beside a card: ${String(allCards.filter((c) => c.modelText !== null).length)}`,
      );

      // An ordinary question after actions, with the conversation's context.
      const cardsBefore = allCards.length;
      await ask('How do we name branches?');
      const reply = await page.evaluate(LAST_REPLY);
      const users = await userCount();
      check(
        "Doesn't break the chat",
        'An ordinary question streams an ordinary reply, and the model received every earlier turn',
        reply.includes('You said: "How do we name branches?"') &&
          reply.includes(`received ${String(users)} of your messages`) &&
          (await cards()).length === cardsBefore,
        reply.slice(-70),
      );

      // In-between states and motion.
      await page.typeText('Remind me to ask Bo about tests [mock:slow]');
      await page.pressEnter();
      await page.waitFor("!!document.querySelector('.todo-card--pending')");
      const pending = await page.evaluate(`(() => {
    const card = document.querySelector('.todo-card--pending');
    window.__pendingCard = card;
    return { title: card.textContent, transition: getComputedStyle(card).transitionDuration };
  })()`);
      await page.waitFor(
        "!document.querySelector('.todo-card--pending') && !document.querySelector('.message--streaming')",
      );
      const settled = await page.evaluate(
        "({ sameElement: window.__pendingCard.isConnected && window.__pendingCard.classList.contains('todo-card--success'), title: window.__pendingCard.textContent })",
      );
      await page.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      const reduced = await page.evaluate(
        "getComputedStyle(document.querySelector('.todo-card')).transitionDuration",
      );
      await page.send('Emulation.setEmulatedMedia', { features: [] });
      check(
        'In-between states',
        'The card shows pending, then the same element turns into success with a short transition; none under reduced motion',
        pending.title === 'Updating your list…' &&
          settled.sameElement &&
          pending.transition !== '0s' &&
          /^0s(, 0s)*$/.test(reduced),
        `${pending.title} → ${settled.title}; transition ${pending.transition}, reduced motion ${reduced}`,
      );

      // Survives a restart.
      const cardsAtClose = await cards();
      const todosAtClose = await stored(TODOS);
      await close();
      await open();
      const cardsAfter = await cards();
      const todosAfter = await stored(TODOS);
      const conversation = JSON.parse((await stored(CONVERSATION)) ?? '{}');
      const storedCards = (conversation.messages ?? []).flatMap((m) =>
        (m.actions ?? []).filter((a) => a.status === 'settled'),
      ).length;
      check(
        'Survives a restart',
        'After closing and reopening Chrome, the stored to-dos and every card (stored and on screen) are unchanged',
        todosAfter !== null &&
          todosAfter === todosAtClose &&
          JSON.stringify(cardsAfter) === JSON.stringify(cardsAtClose) &&
          conversation.version === 3 &&
          storedCards === cardsAfter.length,
        `${String(JSON.parse(todosAfter ?? '{"todos":[]}').todos.length)} to-dos; ${String(cardsAfter.length)} cards on screen, ${String(storedCards)} in the stored conversation (version ${String(conversation.version)})`,
      );
      await close();

      // Honest failure: full and blocked storage.
      for (const [name, script, reason] of [
        ['Full storage', FULL, /storage is full/],
        ['Blocked storage', BLOCKED, /blocking storage/],
      ]) {
        await open({ keepProfile: false, script });
        await ask('Remind me to ask Ana how deploys work');
        const card = await lastCard();
        const todos = await stored(TODOS);
        await ask('How do we name branches?');
        const still = await page.evaluate(LAST_REPLY);
        check(
          'Honest failure',
          `${name}: nothing stored, the card says it couldn't save, no confirmation, and the chat keeps answering`,
          card?.kind === 'failed' &&
            card.tone === 'failure' &&
            /^Couldn't save to your list/.test(card.title) &&
            reason.test(card.title) &&
            (await cards()).every((c) => c.kind !== 'added') &&
            todos === null &&
            still.includes('You said: "How do we name branches?"'),
          `card: ${card?.title}; stored: ${String(todos)}`,
        );
        await close();
      }

      // Amendment 1 (c): two actions in one message, two cards, both changes in storage.
      await open({ keepProfile: false });
      await ask('Remind me to read the deploy guide. Remind me to pair with Bo on tests.');
      const twoCards = await cards();
      const twoStored = await storedTodos();
      const twoConversation = JSON.parse((await stored(CONVERSATION)) ?? '{}');
      const twoReply = twoConversation.messages?.at(-1);
      check(
        'Several actions',
        'Two actions in one reply: two cards in order, both to-dos stored, both cards stored on the one reply',
        twoCards.length === 2 &&
          twoCards.every((card) => card.kind === 'added' && card.modelText === null) &&
          JSON.stringify(twoStored?.map((t) => [t.text, t.done])) ===
            JSON.stringify([
              ['read the deploy guide', false],
              ['pair with Bo on tests', false],
            ]) &&
          twoCards[0].title === `Added to your list: ${twoStored[0].text}` &&
          twoCards[1].title === `Added to your list: ${twoStored[1].text}` &&
          twoReply?.actions?.length === 2 &&
          twoReply.actions.every((a) => a.status === 'settled'),
        `${twoCards.map((c) => c.title).join(' | ')}; stored: ${String(twoStored?.length)}`,
      );
      await close();

      // Amendment 1 (b): unreadable to-do data is removed and the chat says so once.
      await open({ keepProfile: false });
      const quietBefore = await notice('reset');
      await seedAndReload(TODOS, '{"version":1,"todos":[{"broken"');
      const resetShown = await notice('reset');
      const afterReset = await stored(TODOS);
      await reload();
      const resetAgain = await notice('reset');
      check(
        'Unreadable to-do data',
        'Corrupted to-do data is removed and the reset notice shows once, not on the next start',
        !quietBefore.shown &&
          resetShown.shown &&
          resetShown.text === "Your saved to-do list couldn't be read, so it was reset." &&
          afterReset === null &&
          !resetAgain.shown,
        `before: ${String(quietBefore.shown)}; after corrupting: "${resetShown.text}", stored: ${String(afterReset)}; next start: ${String(resetAgain.shown)}`,
      );
      await close();

      // Amendment 1 (a): an engine without tool calling (MOCK_TOOLS=off).
      await restartApp({ MOCK_TOOLS: 'off' });
      await engineWithoutActions(
        `Mock with MOCK_TOOLS=off, engine info delayed ${String(ENGINE_INFO_DELAY_MS)} ms`,
        undefined,
        { engineInfoDelayMs: ENGINE_INFO_DELAY_MS },
      );
      await restartApp({ MOCK_TOOLS: undefined });
      await open({ keepProfile: false });
      await page.waitFor('!!document.querySelector(\'[data-notice="engine"]\')');
      // Give GET /api/engine time to answer before judging the notice absent.
      await page.evaluate('fetch("/api/engine").then((r) => r.json())');
      await page.settle();
      const goneAtStart = await notice('engine');
      // Every reply's start event also reports the engine; after one, the answer is certain.
      await ask('Hi');
      const gone = { ...(await notice('engine')), atStart: goneAtStart.shown };
      check(
        'No tool calling: notice',
        'The notice disappears when the engine can run actions again',
        !gone.shown && !gone.atStart,
        JSON.stringify(gone),
      );
      await close();
    }
  }
} catch (error) {
  check('—', 'Script completed', false, error instanceof Error ? error.message : String(error));
} finally {
  if (page) await page.close();
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 3 });
  await app.close();
}

check(
  '—',
  'No console errors or exceptions',
  consoleErrors.length === 0,
  consoleErrors.join(' | ') || 'none',
);

process.exitCode = finish({ chrome: browserVersion, mode: LIVE ? 'live' : 'mock' });
