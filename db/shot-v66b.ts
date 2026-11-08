// v66 目检②：雷达改名 + 登录态临时查厂 UI（用 24h 缓存命中，零成本）
/// <reference lib="dom" />
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
const page = await ctx.newPage();

// 雷达页
await page.goto("http://localhost:3200/radar", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/v66-radar.png" });
console.log("✓ radar");

// 登录（表单）
await page.goto("http://localhost:3200/login", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);
await page.fill('input[type="email"], input[name="email"]', "m4atest1794109068991@test.com");
await page.fill('input[type="password"]', "Test1234!");
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
console.log("✓ login submitted, url:", page.url());

// 临时查厂：缓存命中名（零成本）
await page.goto("http://localhost:3200/factories", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
await page.fill('input[placeholder*="全名"]', "慈溪市才越光伏科技有限公司");
await page.click('button:has-text("实时核查")');
await page.waitForTimeout(4000);
await page.screenshot({ path: "/tmp/v66-tempcheck.png", fullPage: true });
console.log("✓ tempcheck");

await browser.close();
console.log("done");
