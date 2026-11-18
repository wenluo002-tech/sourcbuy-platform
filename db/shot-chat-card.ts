/** 补拍：把探源卡 scrollIntoView 后取视口截图（对话列表是滚动容器，fullPage 抓不到） */
import { chromium } from "playwright-core";
const BASE = "http://localhost:3200";
async function run(width: number, tag: string) {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.goto(`${BASE}/buyer`, { waitUntil: "networkidle", timeout: 30000 });
    const ta = page.locator("textarea").first();
    await ta.click();
    await ta.fill("我要采购3000件鼻钉，发到美国洛杉矶，一个月内到货");
    await ta.press("Enter");
    const card = page.locator("text=/SB-SR-\\d{8}-\\d{3}|这单需要人工接手|This request needs a human/").first();
    await card.waitFor({ timeout: 180_000 });
    await page.waitForTimeout(9000);
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `/tmp/click-${tag}-card.png` });
    console.log(`[${tag}] ok`);
  } catch (e) {
    await page.screenshot({ path: `/tmp/click-${tag}-error.png` }).catch(() => {});
    console.log(`[${tag}] ERROR ${e instanceof Error ? e.message : e}`);
  }
  await browser.close();
}
async function main() {
  await run(1440, "desktop");
  await run(390, "mobile");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
