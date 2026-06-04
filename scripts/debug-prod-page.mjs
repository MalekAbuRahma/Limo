/**
 * Headless check: production UI errors (especially after fake login session).
 * Run: npx playwright install chromium && node scripts/debug-prod-page.mjs
 */
import { chromium } from 'playwright';

const url = process.env.DEBUG_URL || 'http://147.93.122.6:8080/';

async function runLoginFlow() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];

  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  const user = process.env.DEBUG_USER || 'admin';
  const pass = process.env.DEBUG_PASS || '1234';
  await page.fill('input[type="text"]', user);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);

  const rootText = await page.locator('#root').innerText().catch(() => '');
  const hasLogin = /دخول|Sign in/i.test(rootText) && !/VIP limousine/.test(rootText.slice(0, 30));
  const hasError = /تعذر تحميل|Cannot access/i.test(rootText);
  const hasGarage = /كراج|Garage|السيارات|vehicles/i.test(rootText);

  console.log('\n--- After login (admin/1234) ---');
  console.log('Still login:', hasLogin);
  console.log('Error visible:', hasError);
  console.log('App visible:', hasGarage);
  console.log('Root preview:', rootText.slice(0, 200).replace(/\s+/g, ' '));
  if (errors.length) {
    console.log('Errors:');
    errors.forEach((e) => console.log(' ', e));
  }

  await browser.close();
  return { hasError, errors, hasGarage };
}

async function run(withSession) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];

  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  if (withSession) {
    await page.addInitScript(() => {
      localStorage.setItem(
        'taxi_tracker_session',
        JSON.stringify({
          id: 'debug',
          username: 'admin',
          displayName: 'Debug',
          role: 'admin',
          token: 'debug-token',
          loggedInAt: Date.now(),
        })
      );
    });
  }

  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4000);

  const rootText = await page.locator('#root').innerText().catch(() => '');
  const hasLogin = /دخول|Sign in/i.test(rootText);
  const hasError = /تعذر تحميل|Cannot access/i.test(rootText);

  console.log(`\n--- ${withSession ? 'With session' : 'No session'} ---`);
  console.log('Login visible:', hasLogin);
  console.log('Error visible:', hasError);
  console.log('Root preview:', rootText.slice(0, 120).replace(/\s+/g, ' '));
  if (errors.length) {
    console.log('Errors:');
    errors.forEach((e) => console.log(' ', e));
  } else {
    console.log('No JS errors');
  }

  await browser.close();
  return { hasError, errors };
}

const a = await run(false);
const b = await run(true);
const c = await runLoginFlow();
const failed =
  a.hasError ||
  b.hasError ||
  c.hasError ||
  c.errors.some((e) => /Cannot access/i.test(e)) ||
  (!c.hasGarage && c.errors.length > 0);
process.exit(failed ? 1 : 0);
