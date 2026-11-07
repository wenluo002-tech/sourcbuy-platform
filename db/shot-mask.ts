/// <reference lib="dom" />
// 视觉目检 v2：domcontentloaded + 固定等待（networkidle 在 SPA 上不可靠）
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function shot(url: string, name: string, waitMs = 6000) {
  await page.goto(`http://localhost:3200${url}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `/tmp/qa-${name}.png` });
  console.log(`✓ ${name}`);
}

await shot("/factories/1", "factory-detail");
await shot("/", "home", 8000);
// 对话页：发一条查询看工厂卡与报价对照行
await page.goto("http://localhost:3200/buyer", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(4000);
const box = page.locator("textarea").first();
await box.fill("我想找做吊灯的工厂，3000 件");
await box.press("Enter");
await page.waitForTimeout(25000);
await page.screenshot({ path: "/tmp/qa-buyer.png" });
console.log("✓ buyer");
await browser.close();
process.exit(0);
