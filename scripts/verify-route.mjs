// Verifies that a route loads in real headless Chrome: by direct URL and by clicking its nav link.
// Usage: npm run verify:route -- <path> "<title>" [screenshot.png]
// Starts its own dev server (set APP_URL to reuse one). Exits non-zero if any check fails.
import { createReport, openChrome, startApp } from './lib/chrome.mjs';

const [pathArg, title, screenshotPath] = process.argv.slice(2);
if (pathArg === undefined || !title) {
  console.error('Usage: npm run verify:route -- <path> "<title>" [screenshot.png]');
  process.exit(2);
}
// Git Bash rewrites arguments starting with "/" into Windows paths ("/" -> "C:/Program Files/Git/").
if (/^[A-Za-z]:|\\/.test(pathArg)) {
  console.error(
    `"${pathArg}" looks like a path converted by Git Bash. Pass it without the leading slash (knowledge, not /knowledge).`,
  );
  process.exit(2);
}
const path = `/${pathArg.replace(/^\/+/, '')}`;

const pageState = (expectedTitle) => `(() => {
  const heading = [...document.querySelectorAll('main h2')].find(h => h.textContent.trim() === ${JSON.stringify(expectedTitle)});
  const current = document.querySelector('.app-nav [aria-current="page"]');
  return {
    pathname: location.pathname,
    documentTitle: document.title,
    heading: heading ? heading.textContent.trim() : null,
    currentNav: current ? current.textContent.trim() : null,
    notFound: [...document.querySelectorAll('main h2')].some(h => h.textContent.trim() === 'Page not found'),
  };
})()`;

const app = await startApp();
const page = await openChrome();
const { check, finish } = createReport();
const url = (p) => new URL(p, app.url).href;

try {
  // 1. Direct load, as if the user typed the URL or refreshed.
  await page.goto(url(path));
  await page.waitFor("!!document.querySelector('main h2')");
  await page.settle();
  const direct = await page.evaluate(pageState(title));
  check(
    'load',
    'Route loads by direct URL (not the not-found view)',
    !direct.notFound,
    JSON.stringify({ pathname: direct.pathname, notFound: direct.notFound }),
  );
  check(
    'heading',
    `A heading "${title}" is shown`,
    direct.heading === title,
    `found: ${JSON.stringify(direct.heading)}`,
  );
  check(
    'title',
    `Browser tab title is "${title} · Compass"`,
    direct.documentTitle === `${title} · Compass`,
    `found: ${JSON.stringify(direct.documentTitle)}`,
  );
  check(
    'nav',
    'Its navigation link is marked as current',
    direct.currentNav === title,
    `aria-current link: ${JSON.stringify(direct.currentNav)}`,
  );
  if (screenshotPath) await page.screenshot(screenshotPath);

  // 2. Client-side navigation: start somewhere else and click the nav link.
  const start = path === '/' ? '/__verify-start' : '/';
  await page.goto(url(start));
  await page.waitFor("!!document.querySelector('.app-nav')");
  const clicked = await page.evaluate(`(() => {
    const link = [...document.querySelectorAll('.app-nav a')].find(a => a.getAttribute('href') === ${JSON.stringify(path)});
    if (!link) return false;
    link.click();
    return true;
  })()`);
  await page.settle();
  const viaNav = await page.evaluate(pageState(title));
  check(
    'navigate',
    'Clicking its nav link opens it without a page reload',
    clicked && viaNav.pathname === path && viaNav.heading === title,
    JSON.stringify({ linkFound: clicked, pathname: viaNav.pathname, heading: viaNav.heading }),
  );

  check(
    'console',
    'No console errors or exceptions',
    page.consoleErrors.length === 0,
    page.consoleErrors.join(' | ') || 'none',
  );
} catch (error) {
  check(
    'script',
    'Verification completed',
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  await page.close();
  await app.close();
}

process.exitCode = finish({ chrome: page.browserVersion, path, title });
