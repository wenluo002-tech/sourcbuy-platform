// v66 目检截图：①首页 hero 附件按钮 ②对话页附件+语音按钮 ③培育厂详情页占位卡 ④严选库页临时查厂
/// <reference lib="dom" />
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
const page = await ctx.newPage();

// ① 首页 hero
await page.goto("http://localhost:3200/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/v66-home.png" });
console.log("✓ home");

// ② 对话页（附件+语音按钮在输入区）
await page.goto("http://localhost:3200/buyer", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/v66-chat.png" });
console.log("✓ chat");

// ④ 严选库页（临时查厂卡片）
await page.goto("http://localhost:3200/factories", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/v66-factories.png" });
console.log("✓ factories");

// ③ 全空子分厂详情页（factory_scores 行存在但 7 维全 null → 占位卡）
await page.goto("http://localhost:3200/factories/3", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/v66-detail-pending.png", fullPage: true });
console.log("✓ detail-pending");

await browser.close();
console.log("done");
