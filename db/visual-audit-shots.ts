/* 视觉审计截图：六页×双端。滚动揭示页分段触发后取景（fullPage 对 sticky/滚动揭示有伪影） */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = "/mnt/agents/output/ops/visual-audit-2026-11-18";
const PAGES: Array<[string, string]> = [
  ["home", "/"],
  ["chat", "/buyer"],
  ["factories", "/factories"],
  ["products", "/products"],
  ["calculator", "/calculator"],
  ["verify", "/verify"],
];
const VIEWPORTS: Array<[string, { width: number; height: number }]> = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  for (const [vpName, vp] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, locale: "en-US" });
    const page = await ctx.newPage();
    for (const [name, path] of PAGES) {
      try {
        await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60_000 });
        await page.waitForTimeout(2500);
        // 分段滚动触发懒加载/滚动揭示，再回顶部
        const height = await page.evaluate(() => document.body.scrollHeight);
        for (let y = 0; y < height; y += vp.height) {
          await page.evaluate((yy) => window.scrollTo(0, yy), y);
          await page.waitForTimeout(400);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${OUT}/${vpName}-${name}-top.png` });
        await page.screenshot({ path: `${OUT}/${vpName}-${name}-full.png`, fullPage: true });
        console.log(`OK ${vpName}-${name}`);
      } catch (e) {
        console.log(`FAIL ${vpName}-${name}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  process.exit(0);
}
main();
