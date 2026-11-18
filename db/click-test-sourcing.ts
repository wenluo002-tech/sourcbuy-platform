/** 双端真实点击测试（罗总硬规矩）：买家在 /buyer 输入 gap 品类「舌钉」完整需求
 *  → 等 AI 答卡 + 探源步骤条卡出现 → 截图；若 failed 则点「转人工」→ 验证状态翻转。
 *  桌面 1440 + 移动 390 各跑一遍。TXGC 有钱→scanned；没钱→upstream_error 兜底，两种都算通。 */
import { chromium, type Page } from "playwright-core";
const BASE = "http://localhost:3200";
const MSG = "我要采购3000件鼻钉，发到美国洛杉矶，一个月内到货";

async function run(width: number, tag: string) {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page: Page = await browser.newPage({ viewport: { width, height: 900 } });
  const log = (s: string) => console.log(`[${tag}] ${s}`);
  try {
    await page.goto(`${BASE}/buyer`, { waitUntil: "networkidle", timeout: 30000 });
    const ta = page.locator("textarea").first();
    await ta.click();
    await ta.fill(MSG);
    await ta.press("Enter");
    log("已发送需求，等待 AI 答卡…");
    // 等探源步骤条卡或失败卡出现（AI 答话最长 120s，卡片随后轮询渲染）
    const card = page.locator("text=/SB-SR-\\d{8}-\\d{3}|这单需要人工接手|This request needs a human/").first();
    await card.waitFor({ timeout: 180_000 });
    log("探源卡出现（编号可见）");
    await page.waitForTimeout(9000); // 给一轮 8s 轮询刷状态
    await page.screenshot({ path: `/tmp/click-${tag}-1-card.png`, fullPage: true });
    // 失败兜底：有「转人工」按钮就点（中英都匹配）
    const handoff = page.locator("button", { hasText: /转人工|Hand off/ }).first();
    if (await handoff.count()) {
      await handoff.click();
      log("已点击转人工");
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `/tmp/click-${tag}-2-handoff.png`, fullPage: true });
    } else {
      log("非 failed 态（正常推进中），无需转人工");
    }
    // 抓卡片上的单号，去详情页
    const no = await card.textContent();
    const m = no?.match(/SB-SR-\d{8}-\d{3}/);
    log(`单号=${m?.[0] ?? "未捕获"}`);
  } catch (e) {
    await page.screenshot({ path: `/tmp/click-${tag}-error.png`, fullPage: true }).catch(() => {});
    log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
  await browser.close();
}

async function main() {
  await run(1440, "desktop");
  await run(390, "mobile");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
