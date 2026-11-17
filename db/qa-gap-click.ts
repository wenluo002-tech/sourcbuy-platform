// ═══ P2 双端真实点击测试：/ops 品类缺口候选池 tab（罗总硬规矩：交互按钮必须真实点过）═══
// 用法：OPS_TOKEN=xxx npx tsx db/qa-gap-click.ts
// 覆盖：桌面+移动两端；tab 点击→展开缺口单→切换外贸筛选→点深度调研按钮（候选 1 已有缓存深调，秒回）
import { chromium } from "playwright-core";

const BASE = process.env.QA_BASE ?? "http://localhost:3200";
const TOKEN = process.env.OPS_TOKEN ?? "";
if (!TOKEN) { console.error("需要 OPS_TOKEN"); process.exit(1); }

const VIEWPORTS = [
  { name: "桌面", width: 1280, height: 900 },
  { width: 390, height: 844 }, // 移动端
];

async function main() {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  let pass = 0, fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (ok) { pass++; console.log(`  ✓ ${name}${detail ? "  " + detail : ""}`); }
    else { fail++; console.log(`  ✗ FAIL ${name}${detail ? "  " + detail : ""}`); }
  };

  for (const vp of VIEWPORTS) {
    const tag = vp.width > 800 ? "桌面端" : "移动端";
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`  [pageerror ${tag}]`, String(e).slice(0, 120)));
    await page.addInitScript((t) => localStorage.setItem("sb-token", t), TOKEN);
    await page.goto(`${BASE}/ops`, { waitUntil: "networkidle", timeout: 30_000 });

    // 1. 点「品类缺口候选池」tab
    const tabBtn = page.locator('button:has-text("品类缺口候选池")');
    await tabBtn.click();
    await page.waitForTimeout(1200);
    check(`${tag} tab 点击后缺口单出现`, await page.locator('text=「脐钉」').count() > 0);

    // 2. 展开缺口单
    await page.locator('button:has-text("「脐钉」")').click();
    await page.waitForTimeout(1200);
    check(`${tag} 展开后候选厂出现`, await page.locator('text=青岛华贵承工艺品有限公司').count() > 0);

    // 3. 点深度调研按钮（候选1已有缓存，应秒回）
    const ddBtn = page.locator('button:has-text("深度调研"), button:has-text("刷新深调")').first();
    const btnText = await ddBtn.textContent();
    await ddBtn.click();
    await page.waitForTimeout(2500);
    check(`${tag} 深调结果展示`, await page.locator('text=穿刺').count() > 0, `(按钮="${btnText?.trim()}")`);

    // 4. 外贸筛选：默认开（只见外贸厂），点 checkbox 关掉后应两家都出现
    const beforeToggle = await page.locator('text=城阳区卓光辉饰品厂').count() === 0
      && await page.locator('text=青岛华贵承工艺品有限公司').count() > 0;
    await page.locator('input[type="checkbox"]').click();
    await page.waitForTimeout(1200);
    const afterToggle = await page.locator('text=城阳区卓光辉饰品厂').count() > 0;
    check(`${tag} 外贸筛选生效（默认只外贸厂，关掉后全量）`, beforeToggle && afterToggle);

    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("CLICK TEST ERROR:", e); process.exit(1); });
