const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:3200/radar", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("sb-lang", "zh"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  // 截第一张卡
  const card = page.locator("article").first();
  await card.screenshot({ path: "shot/radar-gt-zh.png" });
  // 验证 GT 链接 href
  const href = await page.locator('article a[href*="trends.google.com"]').first().getAttribute("href");
  console.log("GT 链接:", href);
  await page.evaluate(() => localStorage.setItem("sb-lang", "en"));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("article").first().screenshot({ path: "shot/radar-gt-en.png" });
  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
