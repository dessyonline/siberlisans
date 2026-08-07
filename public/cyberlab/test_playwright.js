const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err));
  
  await page.goto('http://127.0.0.1:5000/');
  console.log("On index page...");
  // Fill login
  await page.fill('#login-identifier', 'testuser1@example.com');
  await page.fill('#login-password', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  console.log("Logged in...");
  
  await page.goto('http://127.0.0.1:5000/profile.html');
  await page.waitForTimeout(2000);
  
  await browser.close();
})();
