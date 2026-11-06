const { chromium } = require("playwright-core");
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://localhost:3200/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "shot/verify-home.png" });
  await browser.close();
  console.log("OK");
})().catch(e => { console.error(e.message); process.exit(1); });
