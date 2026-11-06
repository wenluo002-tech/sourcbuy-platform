const { chromium } = require("playwright-core");
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 700 } });
  await page.goto("http://localhost:3200/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("sb-lang", "zh"));
  await page.goto("http://localhost:3200/factories/6", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "shot/trader-detail-zh2.png" });
  await browser.close();
  console.log("OK");
})().catch(e => { console.error(e.message); process.exit(1); });
