// v74 验证截图：英文详情页 loading 话术 + SKU 翻译自动生效
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => localStorage.setItem("sb-lang", "en"));
await page.goto("http://localhost:3200/products/920369433114", { waitUntil: "domcontentloaded" });
// 1) loading 态：spinner + 话术
try {
  await page.waitForSelector(".sb-spinner", { timeout: 4000 });
  await page.screenshot({ path: "/tmp/v74-loading.png" });
  console.log("loading 态截到");
} catch { console.log("loading 态太快没截到（缓存已命中，好事）"); }
// 2) 首载完成
await page.waitForSelector("h1", { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/v74-loaded.png" });
// 3) 等 SKU 延迟 refetch（3s+余量）
await page.waitForTimeout(4500);
await page.screenshot({ path: "/tmp/v74-refetch.png" });
// 抽样读页面文本验证
const h1 = await page.locator("h1").first().innerText();
const skuSample = await page.locator("button, [class*=sku]").allInnerTexts().catch(() => []);
console.log("H1:", h1.slice(0, 80));
await browser.close();
process.exit(0);
