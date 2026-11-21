/**
 * V111 答卡收敛实测（CO-001-1/2）：
 * 场景A=词搜出货墙+工厂证据默认折叠 → 点击展开 → 主推大卡+2 备选+「全库再筛」折叠 → 点击展开逃生口
 * 场景B=无货墙场景（工厂主角，直接展开）
 * 双端 1440/390，中文界面，真实点击（details/summary 原生交互）
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
  await page.waitForTimeout(5000);
  return resp;
}

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const ck = (name: string, ok: boolean) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); ok ? pass++ : fail++; };

  for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => localStorage.setItem("sb-lang", "zh"));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/buyer`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // 场景A：词搜（出货墙）→ 工厂证据应默认折叠
    await send(page, "我要采购不锈钢保温杯，1000个发德国");
    const evSummary = page.locator("summary", { hasText: "工厂证据" }).first();
    const evCount = await evSummary.count();
    ck(`${name} A1 商品墙在场时工厂证据折叠条出现`, evCount > 0);
    if (evCount) {
      // 折叠态：主推卡不可见
      const topBefore = await page.locator("text=主推").first().isVisible().catch(() => false);
      ck(`${name} A2 折叠态主推卡不可见`, !topBefore);
      await evSummary.scrollIntoViewIfNeeded().catch(() => {});
      await evSummary.click(); // 真实点击展开
      await page.waitForTimeout(600);
      const topAfter = await page.locator("text=主推").first().isVisible().catch(() => false);
      ck(`${name} A3 点击后主推大卡可见`, topAfter);
      await page.screenshot({ path: `${OUT}/v111-a-expanded-${name}.png` });

      // 逃生口
      const rescan = page.locator("summary", { hasText: "全库再筛" }).first();
      const rescanCount = await rescan.count();
      ck(`${name} A4 逃生口折叠条出现`, rescanCount > 0);
      if (rescanCount) {
        await rescan.scrollIntoViewIfNeeded().catch(() => {});
        await rescan.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT}/v111-a-reshow-${name}.png`, fullPage: false });
      }
    } else {
      await page.screenshot({ path: `${OUT}/v111-a-nofold-${name}.png` });
    }

    // 场景B：主推大卡理由 chips 内容断言（栏杆立柱实测 topPick=银标/18年/在售同款，后端 curl 已验）
    await page.goto(`${BASE}/buyer`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await send(page, "我要采购不锈钢栏杆立柱，500件发美国");
    const ev2 = page.locator("summary", { hasText: "工厂证据" }).first();
    if (await ev2.count()) { await ev2.scrollIntoViewIfNeeded().catch(() => {}); await ev2.click(); await page.waitForTimeout(600); }
    const topCard = page.locator("text=主推").first();
    ck(`${name} B1 主推徽章可见`, await topCard.isVisible().catch(() => false));
    ck(`${name} B2 在售同款 chip`, await page.locator("text=在售同款").first().isVisible().catch(() => false));
    ck(`${name} B3 年限 chip 可见`, await page.locator("span.rounded-full", { hasText: /年/ }).first().isVisible().catch(() => false));
    await topCard.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/v111-b-topcard-${name}.png` });
    await ctx.close();
  }
  console.log(`\n合计: ${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
