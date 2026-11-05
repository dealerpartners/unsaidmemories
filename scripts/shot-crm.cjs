const chromium = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
(async () => {
  chromium.setGraphicsMode = false;
  const execPath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    executablePath: execPath,
    args: [...chromium.args, '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests', '--window-size=1440,900'],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const MAYA = 'd221727f-07fb-4ae9-9c59-d00375d0d71c';
  const SEG = '767c211d-63ec-486a-8f69-b49fd8828f5e';
  const OUT = '/home/hatch/workspace/unsaid/notes/crm-screenshots';
  require('fs').mkdirSync(OUT, { recursive: true });
  const targets = [
    ['crm-overview', 'http://127.0.0.1:3141/admin/crm'],
    ['crm-customers', 'http://127.0.0.1:3141/admin/customers'],
    ['crm-customer-profile', `http://127.0.0.1:3141/admin/customers/${MAYA}`],
    ['crm-segments', 'http://127.0.0.1:3141/admin/crm/segments'],
    ['crm-segment-detail', `http://127.0.0.1:3141/admin/crm/segments/${SEG}`],
    ['crm-leads', 'http://127.0.0.1:3141/admin/crm/leads'],
    ['crm-automations', 'http://127.0.0.1:3141/admin/crm/automations'],
    ['crm-dedupe', 'http://127.0.0.1:3141/admin/crm/dedupe'],
  ];
  for (const [name, url] of targets) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log(name, '->', page.url(), '| title:', await page.title());
    } catch (e) { console.log(name, 'FAILED', e.message.slice(0, 140)); }
  }
  await browser.close();
  console.log('SHOTS_DONE');
})();
