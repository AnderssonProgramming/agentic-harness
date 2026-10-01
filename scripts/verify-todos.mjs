// Verifies B-11 in real headless Chrome on the mock engine: chat phrases add, list and complete
// to-dos in storage, the cards come from stored data, failures change nothing, and to-dos and
// cards survive closing the browser. Storage is read through the DevTools protocol (DOMStorage),
// never through the page, so a page that blocks or breaks storage can't fake the result.
//   npm run verify:todos            deterministic, on the mock engine
//   npm run verify:todos -- --live  add, complete, list, context and restart with the engine in .env
// Starts its own dev server. Exits non-zero if any criterion fails.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReport, openChrome, startApp } from './lib/chrome.mjs';

const LIVE = process.argv.includes('--live');
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

const app = await startApp();
const origin = new URL(app.url).origin;
const profileDir = mkdtempSync(join(tmpdir(), 'compass-todos-'));
const { check, finish } = createReport();
const consoleErrors = [];
let browserVersion;
let page;

const cards = () => page.evaluate(CARDS);
const lastCard = async () => (await cards()).at(-1);
const userCount = () => page.evaluate("document.querySelectorAll('.message--user').length");

// Reads localStorage from outside the page.
async function stored(key) {
  const { entries } = await page.send('DOMStorage.getDOMStorageItems', {
    storageId: { securityOrigin: origin, isLocalStorage: true },
  });
  const hit = entries.find(([name]) => name === key);
  return hit ? hit[1] : null;
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

async function ask(text) {
  const before = await page.evaluate("document.querySelectorAll('.message-list > li').length");
  await page.typeText(text);
  await page.pressEnter();
  await page.waitFor(
    `document.querySelectorAll('.message-list > li').length === ${String(before + 2)} && !document.querySelector('.message--streaming')`,
    30_000,
  );
}

try {
  await open();

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
    const storedCards = (conversation.messages ?? []).filter(
      (m) => m.action?.status === 'settled',
    ).length;
    check(
      'Survives a restart',
      'After closing and reopening Chrome, the stored to-dos and every card (stored and on screen) are unchanged',
      todosAfter !== null &&
        todosAfter === todosAtClose &&
        JSON.stringify(cardsAfter) === JSON.stringify(cardsAtClose) &&
        conversation.version === 2 &&
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
