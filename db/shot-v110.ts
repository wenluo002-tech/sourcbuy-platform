/**
 * V110 议价建议卡实测：贴 1688 货号（实时拉商品大卡 ProductCard）+ 报数量 → 报价区出现老采购建议
 * 商品 819874471137（瑜伽裤）：档 1件57.5 / 20件52.5 / 100件42.5
 *   第 1 条报 10 条 → 下一档 20 件省 8.7%、加量 2 倍 ≤3 倍 → 出「老采购建议」加价档卡
 *   第 2 条报 100 条 → 已到顶档 → 出「最大量价档」卡
 * 双端 1440/390，中文界面，真实点击发送
 */
import { chromium } from "playwright-core";
const BASE = "http://localhost:3200";
const OUT = "/mnt/agents/output";

async function send(page: any, text: string) {
  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill(text);
  const chatPromise = page.waitForResponse((r: any) => r.url().includes("ai.chat"), { timeout: 90000 }).catch(() => null);
  await page.keyboard.press("Enter");
  const resp = await chatPromise;
  await page.waitForTimeout(4000);
  return resp;
}

(async () => {
  const browser = await chromium.launch();
  for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => localStorage.setItem("sb-lang", "zh"));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/buyer`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // 第 1 轮：10 条 → 应出加价档议价卡
    const r1 = await send(page, "这个货 819874471137 我要 10 条，发到美国洛杉矶");
    const tip = await page.locator("text=老采购建议").count();
    // 滚到议价卡截图
    const card = page.locator("text=老采购建议").first();
    if (await card.count()) {
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: `${OUT}/v110-bargain-${name}.png`, fullPage: false });

    // 第 2 轮：100 条 → 应出顶档卡
    const r2 = await send(page, "这个货 819874471137 我要 100 条");
    const top = await page.locator("text=最大量价档").count();
    const card2 = page.locator("text=最大量价档").first();
    if (await card2.count()) {
      await card2.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: `${OUT}/v110-bargain-top-${name}.png`, fullPage: false });

    console.log(`${name}: 议价卡(加价档)=${tip} 顶档=${top} chat1=${r1 ? r1.status() : "timeout"} chat2=${r2 ? r2.status() : "timeout"}`);
    await ctx.close();
  }
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
