import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => localStorage.setItem("sb-lang", "en"));
await page.goto("http://localhost:3200/products/920369433114", { waitUntil: "domcontentloaded" });
await page.waitForSelector("h1", { timeout: 30000 });
// 轮询观察 SKU 中文残留
for (const wait of [8000, 15000, 20000, 20000]) {
  await page.waitForTimeout(wait);
  const zhCount = await page.evaluate(() => {
    const els = document.querySelectorAll("button");
    let n = 0;
    els.forEach((b) => { if (/[\u4e00-\u9fff]/.test(b.innerText)) n++; });
    return n;
  });
  console.log(`等待累计后 中文SKU按钮数=${zhCount}`);
  if (zhCount === 0) break;
}
await page.screenshot({ path: "/tmp/v74-final.png" });
await browser.close();
process.exit(0);
