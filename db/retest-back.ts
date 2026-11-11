// 复测：详情页返回入口（含加载态）+ 返回后对话恢复
import { chromium } from "playwright-core";

const BASE = "http://localhost:3200";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
await ctx.addInitScript(() => localStorage.setItem("sb-lang", "zh"));
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("[pageerror] " + String(e).slice(0, 200)));
page.on("crash", () => errors.push("[CRASH]"));

// 1. 对话发问拿到商品卡
await page.goto(`${BASE}/buyer`, { waitUntil: "domcontentloaded" });
const box = page.locator("input:visible:not([type=hidden]):not([type=file])").last();
await box.waitFor({ timeout: 30_000 });
await box.fill("我想采购山地自行车");
await box.press("Enter");
const card = page.locator('a[href*="/products/"]').first();
await card.waitFor({ timeout: 90_000 });
const myMsg = await page.locator("text=我想采购山地自行车").count();
console.log("1. 对话页消息在:", myMsg > 0);

// 2. 点进详情——加载态就要有返回入口
await card.click();
await page.waitForTimeout(600); // 故意不等加载完，先看加载态
const backEarly = await page.locator('button:has-text("返回")').count();
console.log("2. 详情页加载态返回入口:", backEarly > 0 ? "有" : "无");
await page.waitForTimeout(6000);
const backLoaded = await page.locator('button:has-text("返回")').count();
console.log("3. 详情页加载完成后返回入口:", backLoaded > 0 ? "有" : "无");
await page.screenshot({ path: "/tmp/fix-detail.png" });

// 3. 点页面内返回按钮
await page.locator('button:has-text("返回")').first().click();
await page.waitForTimeout(3500);
console.log("4. 页面内返回后 URL:", page.url());
const cardsBack = await page.locator('a[href*="/products/"]').count();
const msgBack = await page.locator("text=我想采购山地自行车").count();
console.log("5. 返回后对话恢复: 消息", msgBack > 0 ? "在" : "丢", "/ 商品卡", cardsBack, "张");
await page.screenshot({ path: "/tmp/fix-back.png" });

// 4. 再进一次详情，改用浏览器返回键
const card2 = page.locator('a[href*="/products/"]').first();
await card2.waitFor({ timeout: 30_000 });
await card2.click();
await page.waitForSelector('button:has-text("返回")', { timeout: 15_000 });
await page.goBack();
await page.waitForTimeout(3500);
const cardsBack2 = await page.locator('a[href*="/products/"]').count();
console.log("6. 浏览器返回键后 URL:", page.url(), "/ 商品卡", cardsBack2, "张");

// 5. 工厂详情智能返回（从对话页工厂卡进）
const fcard = page.locator('a[href*="/factories/"]').first();
if (await fcard.count()) {
  await fcard.click();
  await page.waitForTimeout(3000);
  await page.locator('button:has-text("返回")').first().click();
  await page.waitForTimeout(3000);
  const cardsBack3 = await page.locator('a[href*="/products/"]').count();
  console.log("7. 工厂详情返回后 URL:", page.url(), "/ 对话商品卡", cardsBack3, "张");
} else {
  console.log("7. 本轮无工厂卡，跳过");
}

console.log("\n=== 前端错误 ===");
console.log(errors.length ? errors.join("\n") : "（无）");
await browser.close();
process.exit(0);
