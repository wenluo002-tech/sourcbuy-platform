// v66 目检③：EN 版首页 + 严选库（查 raw key 泄漏）
/// <reference lib="dom" />
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
const page = await ctx.newPage();

await page.goto("http://localhost:3200/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button, a"));
  const en = btns.find((b) => b.textContent?.trim() === "EN" || b.textContent?.trim() === "中文");
  if (en && en.textContent?.trim() === "中文") return; // 已是英文
  const sw = btns.find((b) => b.textContent?.trim() === "EN");
  if (sw) (sw as HTMLElement).click();
});
await page.waitForTimeout(2000);
await page.screenshot({ path: "/tmp/v66-home-en.png" });
console.log("✓ home-en");

await page.goto("http://localhost:3200/factories", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "/tmp/v66-factories-en.png" });
console.log("✓ factories-en");

await browser.close();
console.log("done");
