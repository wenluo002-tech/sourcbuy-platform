// ═══ 工商档案版兜底·双端真实点击（罗总硬规矩）═══
// 流程：ops 白名单会话 → /verify 申请「广东宏新源科技有限公司」（TXGC miss，走天眼查兜底）
//   → 等生成 → 报告页核内容 → PDF 按钮可见。桌面 1440 + 移动 390。
import { chromium } from "playwright-core";
import { createSession } from "../api/lib/auth";

const BASE = process.env.QA_BASE ?? "http://localhost:3200";
const COMPANY = "广东宏新源科技有限公司";

async function main() {
  const { token } = await createSession(600001); // ops 白名单：免扣分不限次
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  let pass = 0, fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (ok) { pass++; console.log(`  ✓ ${name}${detail ? "  " + detail : ""}`); }
    else { fail++; console.log(`  ✗ FAIL ${name}${detail ? "  " + detail : ""}`); }
  };

  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const tag = vp.width > 800 ? "桌面端" : "移动端";
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`  [pageerror ${tag}]`, String(e).slice(0, 120)));
    await page.addInitScript((t) => localStorage.setItem("sb-token", t), token);

    // 1. 进 /verify 申请页（语言无关选择器：ops 账号 locale=en；公司名=表单第一个 input）
    await page.goto(`${BASE}/verify`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);
    const companyInput = page.locator("input").first();
    const formVisible = await companyInput.isVisible().catch(() => false);
    check(`${tag} 登录态生效（申请表单出现）`, formVisible);
    if (!formVisible) {
      await page.screenshot({ path: `/tmp/verify-debug-${vp.width}.png` });
      console.log("  [debug] body 前 300 字:", ((await page.textContent("body")) ?? "").slice(0, 300));
      await ctx.close();
      continue;
    }
    await companyInput.fill(COMPANY);
    // 2. 提交申请（按钮=表单区唯一主按钮，中英文案都含 report/报告）
    const submitBtn = page.locator('button:has-text("report"), button:has-text("报告")').first();
    check(`${tag} 提交按钮可用`, await submitBtn.isEnabled());
    await submitBtn.click();
    // 3. 等跳转报告页（生成 30-90s：TXGC search + 天眼查 + 万邦 + PDF）
    await page.waitForURL(/\/verify\/\d+/, { timeout: 30_000 }).catch(() => {});
    const url = page.url();
    check(`${tag} 提交后进入报告页`, /\/verify\/\d+/.test(url), url.replace(BASE, ""));
    // 4. 轮询等报告 ready（语言无关锚点：信用代码任何语言版本都在）
    let ready = false;
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(5000);
      await page.reload({ waitUntil: "networkidle" }).catch(() => {});
      const body = await page.textContent("body");
      if (body?.includes("91440111MAE6F7E91X")) { ready = true; break; }
      if (body?.includes("生成失败") || body?.includes("failed")) break;
    }
    check(`${tag} 报告生成成功（工商档案版）`, ready);
    if (ready) {
      const body = (await page.textContent("body")) ?? "";
      check(`${tag} 信用代码渲染`, body.includes("91440111MAE6F7E91X"));
      check(`${tag} 参保人数渲染`, body.includes("14"));
      check(`${tag} 法定代表人渲染`, body.includes("叶正宏"));
    }
    await page.screenshot({ path: `/tmp/verify-tyc-${vp.width}.png` });
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
