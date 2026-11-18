const { chromium } = require("playwright-core");
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("sb-lang", "zh"); } catch {} });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3200/", { waitUntil: "networkidle", timeout: 30000 });
  // 分段滚动触发滚动揭示
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
  // 核查入口带取景
  await page.locator("text=供应商核查").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "shot/ps1b-verifyband.png" });
  await browser.close();
  console.log("OK");
})().catch(e => { console.error(e.message); process.exit(1); });
