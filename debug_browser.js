import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('Browser Error:', msg.text());
  });
  page.on('pageerror', exception => {
    console.error('Page Exception:', exception.message, exception.stack);
  });

  console.log("Navigating...");
  await page.goto('http://localhost:3001/disciplines', { waitUntil: 'networkidle', timeout: 10000 }).catch(e => console.log("Timeout", e));
  
  await browser.close();
})();
