import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext();
await ctx.addInitScript(() => localStorage.setItem("sb-lang", "zh"));
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
// 站内跳转路径：列表 → 详情 → 点返回
await page.goto("http://localhost:3200/factories", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.locator('a[href*="/factories/"]').first().click();
await page.waitForTimeout(3000);
console.log("URL:", page.url());
const btns = await page.locator('button:has-text("返回")').count();
console.log("返回按钮数:", btns);
await page.locator('button:has-text("返回")').first().click();
await page.waitForTimeout(2500);
console.log("点击后 URL:", page.url());
await browser.close(); process.exit(0);
