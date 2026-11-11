// 用户身份全流程走查：抓 console 报错/页面崩溃 + 复现「详情页无法返回上一层」
import { chromium } from "playwright-core";

const BASE = "http://localhost:3200";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
await ctx.addInitScript(() => localStorage.setItem("sb-lang", "zh"));
const page = await ctx.newPage();

const errors: string[] = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("[pageerror] " + String(e).slice(0, 300)));
page.on("crash", () => errors.push("[CRASH] 页面崩溃！"));

// 第 1 站：首页
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
console.log("1. 首页 URL:", page.url());

// 第 2 站：对话页发一条寻源消息（走真实 ai.chat）
await page.goto(`${BASE}/buyer`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const box = page.locator("textarea, input:visible:not([type=hidden]):not([type=file])").last();
await box.waitFor({ timeout: 30_000 });
await box.fill("我想采购山地自行车");
await box.press("Enter");
console.log("2. 已发问，等待结果卡…");
// 等商品卡出现（卡片里有链接到 /products/）
const card = page.locator('a[href*="/products/"]').first();
await card.waitFor({ timeout: 90_000 });
const href = await card.getAttribute("href");
console.log("3. 商品卡链接:", href);
await page.screenshot({ path: "/tmp/walk-chat.png" });

// 第 3 站：点进商品详情
await card.click();
await page.waitForTimeout(3000);
console.log("4. 详情页 URL:", page.url());
await page.screenshot({ path: "/tmp/walk-detail.png" });
// 详情页有没有返回入口？
const backBtn = await page.locator('button:has-text("返回"), a:has-text("返回"), [aria-label*="back" i], [aria-label*="返回"]').count();
console.log("5. 详情页显式返回入口数量:", backBtn);

// 第 4 站：按浏览器返回键，看落到哪
await page.goBack();
await page.waitForTimeout(2500);
console.log("6. 浏览器返回后 URL:", page.url());
await page.screenshot({ path: "/tmp/walk-back.png" });
// 对话内容还在吗？
const stillHasCard = await page.locator('a[href*="/products/"]').count();
console.log("7. 返回后对话页商品卡数量:", stillHasCard);

// 第 5 站：工厂列表 → 工厂详情 → 返回
await page.goto(`${BASE}/factories`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const flink = page.locator('a[href*="/factories/"]').first();
await flink.waitFor({ timeout: 30_000 });
await flink.click();
await page.waitForTimeout(2500);
console.log("8. 工厂详情 URL:", page.url());
const fBackBtn = await page.locator('button:has-text("返回"), a:has-text("返回")').count();
console.log("9. 工厂详情页显式返回入口数量:", fBackBtn);
await page.goBack();
await page.waitForTimeout(2000);
console.log("10. 工厂详情返回后 URL:", page.url());

console.log("\n=== 前端错误汇总 ===");
console.log(errors.length ? errors.join("\n") : "（无 console/pageerror/崩溃）");
await browser.close();
process.exit(0);
