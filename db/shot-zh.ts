/// <reference lib="dom" />
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:3200/factories", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button, a"));
  const zh = btns.find((b) => b.textContent?.trim() === "中文");
  if (zh) (zh as HTMLElement).click();
});
await page.waitForTimeout(4000);
await page.screenshot({ path: "/tmp/qa-factories-zh.png" });
console.log("✓ zh");
await browser.close();
process.exit(0);
