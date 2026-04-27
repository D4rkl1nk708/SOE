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

  console.log("Navigating to live site...");
  await page.goto('https://soe-ten.vercel.app/disciplines', { waitUntil: 'networkidle', timeout: 15000 }).catch(e => console.log("Timeout", e));
  
  // wait 5 seconds
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
})();
