const { chromium } = require("playwright-core");
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:3200/factories/6", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "shot/trader-detail-zh.png" });
  // 英文版
  await page.evaluate(() => localStorage.setItem("sb-lang", "en"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "shot/trader-detail-en.png" });
  await browser.close();
  console.log("OK");
})().catch(e => { console.error(e.message); process.exit(1); });
