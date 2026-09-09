import puppeteer from 'puppeteer-core';
const LIVE = 'https://networking-tracker-five-sage.vercel.app';
const OUT = '/Users/chaekim/Desktop/networking-tracker/docs/screenshots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});

async function signedInPage(delayDataApi, failDataApi) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 2 });
  await page.goto(`${LIVE}/auth/sign-in`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#email');
  await page.type('#email', 'rls-test-a@example.com');
  await page.type('#password', 'TestPassw0rd!A');
  const btn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in'));
  await btn.asElement().click();
  await page.waitForFunction(() => location.pathname.startsWith('/contacts'), { timeout: 20000 });
  await sleep(2500);

  // Now interfere with the contacts read, then reload.
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const isRead = req.url().includes('/rest/v1/contacts');
    if (isRead && failDataApi) return req.abort('failed');
    if (isRead && delayDataApi) { await sleep(delayDataApi); return req.continue(); }
    return req.continue();
  });
  return page;
}

console.log('loading state');
const p1 = await signedInPage(9000, false);
p1.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await sleep(3000);                       // capture mid-fetch, while skeletons show
await p1.screenshot({ path: `${OUT}/14-loading-state.png` });
console.log('  ✓ 14-loading-state');
await p1.close();

console.log('error state');
const p2 = await signedInPage(0, true);
p2.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await sleep(6000);
await p2.screenshot({ path: `${OUT}/15-error-state.png` });
console.log('  ✓ 15-error-state');
await p2.close();

await browser.close();
console.log('done');
