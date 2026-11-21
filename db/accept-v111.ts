/** V111 五点验收（罗总清单）：立柱+马桶两条真实需求，抓 reply 全文+截图 */
import { chromium } from "playwright-core";
const BASE = "http://localhost:3200";
const OUT = "/mnt/agents/output";

async function send(page: any, text: string) {
  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill(text);
  const p = page.waitForResponse((r: any) => r.url().includes("ai.chat"), { timeout: 90000 }).catch(() => null);
  await page.keyboard.press("Enter");
  const resp = await p;
  await page.waitForTimeout(5000);
  if (!resp) return null;
  return (await resp.json())?.result?.data?.json ?? null;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => localStorage.setItem("sb-lang", "zh"));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/buyer`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // 第一条：立柱
  const r1 = await send(page, "我要采购不锈钢立柱，2000件发美国");
  console.log("=== 立柱 reply 全文 ===");
  console.log(r1?.reply ?? "(无)");
  console.log("topPick:", JSON.stringify(r1?.topPick ?? null));
  // 展开工厂证据+逃生口
  const ev = page.locator("summary", { hasText: "工厂证据" }).first();
  if (await ev.count()) { await ev.scrollIntoViewIfNeeded().catch(() => {}); await ev.click(); await page.waitForTimeout(500); }
  await page.screenshot({ path: `${OUT}/v111-accept-post.png` });
  const rescan = page.locator("summary", { hasText: "全库再筛" }).first();
  if (await rescan.count()) { await rescan.scrollIntoViewIfNeeded().catch(() => {}); await rescan.click(); await page.waitForTimeout(500); }
  await page.screenshot({ path: `${OUT}/v111-accept-post-reshow.png` });

  // 第二条：马桶（新对话页）
  await page.goto(`${BASE}/buyer`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r2 = await send(page, "我想找智能马桶，先拿 50 台试单，发沙特");
  console.log("\n=== 马桶 reply 全文 ===");
  console.log(r2?.reply ?? "(无)");
  console.log("topPick:", JSON.stringify(r2?.topPick ?? null));
  const ev2 = page.locator("summary", { hasText: "工厂证据" }).first();
  if (await ev2.count()) { await ev2.click().catch(() => {}); await page.waitForTimeout(500); }
  await page.screenshot({ path: `${OUT}/v111-accept-toilet.png` });

  await browser.close();
  process.exit(0);
})();
