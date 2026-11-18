/** 转人工按钮真实点击测试：建临时 failed 单 → 浏览器打开详情页 → 点「转人工」→ 验证状态翻转 → 清理 */
import { chromium } from "playwright-core";
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { createSourcingRequest, failRequest } from "../api/lib/sourcingRequest";

async function main() {
  const db = getDb();
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  let pass = true;
  const ids: number[] = [];
  try {
    for (const [w, tag] of [[1440, "desktop"], [390, "mobile"]] as const) {
      const sr = await createSourcingRequest({ userId: null, keyword: "转人工点击自测", locale: "en" });
      if (!sr) throw new Error("建单失败");
      ids.push(sr.id);
      await failRequest(sr.id, "no_keyword", "点击测试占位");
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.goto(`http://localhost:3200/sourcing/${sr.id}`, { waitUntil: "networkidle", timeout: 30000 });
      const btn = page.locator("button", { hasText: /转人工|Hand off/ }).first();
      await btn.waitFor({ timeout: 20000 });
      await page.screenshot({ path: `/tmp/handoff-${tag}-before.png` });
      await btn.click();
      await page.waitForTimeout(5000); // 等 mutation + refetch
      await page.screenshot({ path: `/tmp/handoff-${tag}-after.png` });
      const body = await page.textContent("body");
      const [rows] = (await db.execute(dsql`SELECT status FROM sourcing_requests WHERE id = ${sr.id}`)) as unknown as [[{ status?: string }?]];
      const st = rows?.[0]?.status;
      const okTxt = /已转人工|Handed off|Sourcing in progress/.test(body ?? "");
      console.log(`[${tag}] 页面确认文案=${okTxt ? "OK" : "缺失"} DB状态=${st}`);
      pass = pass && okTxt && st === "verifying";
      await page.close();
    }
    console.log(pass ? "转人工点击链路 PASS（双端）" : "FAIL");
    if (!pass) process.exitCode = 1;
  } finally {
    await browser.close();
    for (const id of ids) {
      await db.execute(dsql`DELETE FROM sourcing_request_events WHERE request_id = ${id}`).catch(() => {});
      await db.execute(dsql`DELETE FROM sourcing_requests WHERE id = ${id}`).catch(() => {});
    }
    console.log("临时单已清理", ids.join(","));
  }
  process.exit(process.exitCode ?? 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
