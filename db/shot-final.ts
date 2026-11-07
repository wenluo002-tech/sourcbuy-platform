/// <reference lib="dom" />
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// 首页品类覆盖区块：滚到底部等加载，截区块
await page.goto("http://localhost:3200/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(5000);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55));
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/qa-home-cat.png" });
console.log("✓ home-cat");

// 对话页：input[type=text]
await page.goto("http://localhost:3200/buyer", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(4000);
const box = page.locator("input").last();
await box.fill("我想找做吊灯的工厂，3000 件");
await box.press("Enter");
await page.waitForTimeout(25000);
await page.screenshot({ path: "/tmp/qa-buyer.png" });
console.log("✓ buyer");
await browser.close();
process.exit(0);
