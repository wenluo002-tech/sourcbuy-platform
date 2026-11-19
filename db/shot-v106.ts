/**
 * V106 三修端到端实测（罗总三截图反馈，2026-11-19 拍板）：
 * 图1 寒暄不播四步卡（classify=light→极简「正在看…」；寻源→四步作业卡）
 * 图2 活跃探源卡吸顶+状态与商品墙对齐（24h 去重指向 SB-SR-20261119-003，不再重复挂）
 * 图3 商品墙方案A瘦身（无价格行/无服务费/无经济锁，详情页报价区见经济锁 diyLine）
 * 双端：桌面 1440 + 移动 390。真实点击、真实 LLM 答话。
 */
import { chromium } from "playwright-core";
const BASE = "http://localhost:3200";
const OUT = "/mnt/agents/output";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`, extra ?? ""); }
}

async function sendMsg(page: any, text: string) {
  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill(text);
  const classifyPromise = page.waitForResponse((r: any) => r.url().includes("ai.classify"), { timeout: 15000 }).catch(() => null);
  const chatPromise = page.waitForResponse((r: any) => r.url().includes("ai.chat"), { timeout: 90000 }).catch(() => null);
  await page.keyboard.press("Enter");
  const [classifyRes, chatRes] = await Promise.all([classifyPromise, chatPromise]);
  let kind: string | null = null;
  try {
    const j = await classifyRes?.json();
    // tRPC batch 时响应是数组，单发是对象——两种形态都解
    const items = Array.isArray(j) ? j : [j];
    kind = items.find((it: any) => it?.result?.data?.json?.kind)?.result?.data?.json?.kind ?? null;
  } catch { /* ignore */ }
  return { kind, chatOk: !!chatRes };
}

async function flow(width: number, tag: string) {
  console.log(`\n=== ${tag} (${width}px) ===`);
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  // 固定中文界面做断言（sandbox Chromium 默认 en，会走英文文案导致断言落空）
  await page.addInitScript(() => { try { localStorage.setItem("sb-lang", "zh"); } catch { /* ignore */ } });
  await page.goto(`${BASE}/buyer`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // —— 图1a：寒暄/报称呼 → classify=light，pending 播极简动画，绝不出现四步卡 ——
  console.log("[图1a] 发送「叫我文哥」");
  const t0 = Date.now();
  const r1p = sendMsg(page, "叫我文哥");
  // 显式等极简动画出现（移动端慢，定死 1200ms 会抢跑）
  const liteShown = await page.locator("text=正在看").first().waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
  const body1 = await page.textContent("body");
  ok("寒暄 pending 出现极简「正在看」", liteShown);
  ok("寒暄 pending 不出现四步卡（解析采购需求）", !(body1 ?? "").includes("解析采购需求"));
  await page.screenshot({ path: `${OUT}/v106-1-light-thinking-${tag}.png` });
  const r1 = await r1p;
  console.log(`  classify 返回 kind=${r1.kind}（${Date.now() - t0}ms 含 chat）chatOk=${r1.chatOk}`);
  ok("classify 判定寒暄=light", r1.kind === "light");
  await page.waitForTimeout(1000);

  // —— 图1b+图3：真寻源 → classify=sourcing，四步卡出现；答话后商品墙无价格 ——
  console.log("[图1b/图3] 发送「瑜伽裤 500 条，发德国」");
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 30000 });
  const r2p = sendMsg(page, "瑜伽裤 500 条，发德国");
  await page.locator("text=解析采购需求").first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200); // 四步卡第二三步取景
  const body2 = await page.textContent("body");
  ok("寻源 pending 出现四步卡", (body2 ?? "").includes("解析采购需求") && (body2 ?? "").includes("作业中"));
  await page.screenshot({ path: `${OUT}/v106-2-sourcing-status-${tag}.png` });
  const r2 = await r2p;
  console.log(`  classify kind=${r2.kind} chatOk=${r2.chatOk}`);
  ok("classify 判定寻源=sourcing", r2.kind === "sourcing");
  await page.waitForTimeout(2500); // 等商品墙渲染
  const body3 = (await page.textContent("body")) ?? "";
  const hasStrip = body3.includes("真实在售货源");
  ok("商品墙渲染", hasStrip);
  if (hasStrip) {
    // 方案A：墙内不得出现价格/服务费/经济锁/算到手价（AI 话术文本可能报价，只查墙卡片区域）
    const strip = page.locator("text=真实在售货源").first().locator("xpath=following::div[1]");
    const stripText = (await strip.textContent().catch(() => "")) ?? "";
    ok("商品墙无 ¥ 价格行", !/¥\s*\d/.test(stripText), stripText.slice(0, 120));
    ok("商品墙无服务费行", !stripText.includes("服务费"));
    ok("商品墙无经济锁对照行", !stripText.includes("隐形成本"));
    ok("商品墙保留已售/在售信号", stripText.includes("已售") || stripText.includes("在售"));
    ok("商品墙保留详情入口", stripText.includes("详情"));
  }
  await page.screenshot({ path: `${OUT}/v106-3-strip-noprice-${tag}.png`, fullPage: false });

  // —— 图3b：点进详情页 → 报价区+经济锁 diyLine（详情页直连上游核价，慢，显式等文案） ——
  console.log("[图3b] 点商品卡进详情页");
  const detailLink = page.locator('a[href^="/products/"]').first();
  if (await detailLink.count()) {
    await detailLink.click();
    const diy = page.locator("text=隐形成本").first();
    const diyOk = await diy.waitFor({ state: "visible", timeout: 45000 }).then(() => true).catch(() => false);
    const dbody = (await page.textContent("body")) ?? "";
    ok("详情页有报价（出厂价）", /¥\s*\d/.test(dbody) || dbody.includes("出厂价"));
    ok("详情页报价区有经济锁对照行", diyOk && dbody.includes("隐形成本"));
    await page.screenshot({ path: `${OUT}/v106-4-detail-diyline-${tag}.png`, fullPage: false });
    await page.goBack();
    await page.waitForTimeout(2500);
  } else {
    ok("商品墙可点详情链接", false, "无 /products/ 链接");
  }

  // —— 图2：触发探源（24h 去重→宠物轮椅单 scanned 态，零成本）→ 吸顶单卡、不重复挂 ——
  console.log("[图2] 发送「宠物轮椅 50 台」（去重应指向 SB-SR-20261119-001）");
  try {
    const r3 = await sendMsg(page, "宠物轮椅 50 台");
    // 卡的 sourcing.get 查询有延迟，显式等出现（定死 sleep 会抢跑误判）
    await page.locator("text=探源进行中").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    const body4 = (await page.textContent("body")) ?? "";
    const cardCount = await page.locator("text=探源进行中").count();
    ok("探源卡出现且全页最多一张（吸顶单卡）", cardCount === 1, `count=${cardCount}`);
    ok("探源单 001 去重挂载（SB-SR-20261119-001）", body4.includes("SB-SR-20261119-001"));
    // 状态语义修正：scanned=扫描已完成→扫描步亮计数、AI 初筛如实排队（不谎称进行中）
    ok("扫描步显示真实计数（命中 n 家档案）", /命中\s*\d+\s*家档案/.test(body4));
    ok("AI 初筛显示排队中（P3 未上线不演戏）", body4.includes("排队中"));
    // 吸顶验证：滚到顶部再滚回底部，卡都应在容器视口顶部
    const scrollBox = page.locator(".sb-scroll").first();
    if ((await scrollBox.count()) && cardCount === 1) {
      await scrollBox.evaluate((el: any) => el.scrollTo({ top: 0 }));
      await page.waitForTimeout(400);
      const card = page.locator("text=探源进行中").first();
      const bb = await card.boundingBox();
      const sb = await scrollBox.boundingBox();
      ok("滚动后探源卡仍钉在对话区顶部", !!bb && !!sb && bb.y - sb.y < 60, bb ? `y差=${Math.round(bb.y - (sb?.y ?? 0))}` : "no box");
      await page.screenshot({ path: `${OUT}/v106-5-pinned-sourcing-${tag}.png`, fullPage: false });
    }
  } catch (e) {
    ok("图2 探源流程执行", false, String(e).slice(0, 120));
    await page.screenshot({ path: `${OUT}/v106-5-pinned-sourcing-${tag}-err.png`, fullPage: false }).catch(() => {});
  }

  await browser.close();
}

async function main() {
  await flow(1440, "desktop");
  await flow(390, "mobile");
  console.log(`\n===== V106 E2E: ${pass} PASS / ${fail} FAIL =====`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
