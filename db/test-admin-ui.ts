// M5 管理端 UI 双端真实点击验收（罗总硬规矩：交互改动必须真实点击后才交付）
// 流程：注册测试账号 → 临时加入 ops 白名单 → 看门狗重启 → Playwright 桌面+移动逐页点击 → 负例（非管理员）→ 清场还原
import { chromium } from "playwright-core";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";

process.loadEnvFile();
const db = getDb();
const BASE = "http://localhost:3200";
const stamp = Date.now().toString(36);
const ADMIN_EMAIL = `m5admin_${stamp}@test.dev`;
const PLAIN_EMAIL = `m5plain_${stamp}@test.dev`;
const PASS = "m5e2e-pass-88";
const ENV_PATH = "/mnt/agents/output/app/.env";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra?: string) => {
  if (cond) { pass++; console.log(`PASS  ${name}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? " — " + extra : ""}`); }
};

async function register(email: string): Promise<{ token: string; id: number }> {
  const r = await fetch(`${BASE}/api/trpc/auth.register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { email, password: PASS, displayName: "M5 UI 验收", locale: "zh" } }),
  });
  const j: any = await r.json();
  const d = j?.result?.data?.json ?? j?.result?.data;
  if (!d?.token) throw new Error("register failed: " + JSON.stringify(j).slice(0, 200));
  return { token: d.token, id: d.user.id };
}

async function waitUp(timeoutMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(3000) });
      if (r.status === 200) return true;
    } catch { /* 重启中 */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

const envOrig = fs.readFileSync(ENV_PATH, "utf8");
let adminId = 0, plainId = 0;
const testStart = new Date();

try {
  // ① 注册两个账号：候选管理员 + 普通买家（负例）
  const a = await register(ADMIN_EMAIL);
  adminId = a.id;
  const b = await register(PLAIN_EMAIL);
  plainId = b.id;
  ok("两个测试账号注册成功", !!a.token && !!b.token);

  // ② 临时把候选管理员加进 OPS 白名单并重启（看门狗拉起新进程读新 env）
  const env2 = envOrig.replace(/OPS_ADMIN_EMAILS=(.*)/, `OPS_ADMIN_EMAILS=$1,${ADMIN_EMAIL}`);
  ok(".env 白名单已临时追加", envOrig !== env2 && env2.includes(ADMIN_EMAIL));
  fs.writeFileSync(ENV_PATH, env2);
  try { execSync("pkill -f 'node dist/boot' || true"); } catch { /* */ }
  const up = await waitUp();
  ok("看门狗带新白名单重启完成", up);
  // 确认 auth.me 返回 isAdmin
  const meR = await fetch(`${BASE}/api/trpc/auth.me`, { headers: { Authorization: `Bearer ${a.token}` } });
  const meJ: any = await meR.json();
  const meD = meJ?.result?.data?.json ?? meJ?.result?.data;
  ok("auth.me 返回 isAdmin=true", meD?.isAdmin === true, JSON.stringify(meD).slice(0, 160));

  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });

  // ③ 桌面端 1440：逐页真实点击
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await ctx.addInitScript((t) => { localStorage.setItem("sb-token", t); localStorage.setItem("sb-lang", "zh"); }, a.token);
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=经营驾驶舱", { timeout: 30_000 });
    await page.waitForSelector("text=独立访客", { timeout: 30_000 });
    await page.waitForSelector("text=转化漏斗", { timeout: 30_000 });
    await page.waitForTimeout(1200); // 等数据区渲染完再截图
    ok("驾驶舱 KPI 渲染", await page.locator("text=成交 GMV").count() > 0);
    // 切周期 tab
    await page.getByRole("button", { name: "今日" }).click();
    await page.waitForSelector("text=转化漏斗", { timeout: 30_000 });
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "近 30 天" }).click();
    await page.waitForTimeout(500); // 让 refetch 启动
    await page.waitForSelector("text=载入台账…", { state: "detached", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(800); // 渲染稳定后截图
    ok("周期切换（今日/近30天）点击无报错", errs.length === 0, errs.join(" | ").slice(0, 200));
    await page.screenshot({ path: "/tmp/m5-admin-dashboard.png" });

    await page.getByRole("link", { name: /渠道归因/ }).click();
    await page.waitForSelector("text=归因口径", { timeout: 15_000 });
    await page.waitForTimeout(1200);
    ok("渠道页渲染", true);
    await page.screenshot({ path: "/tmp/m5-admin-channels.png" });

    await page.getByRole("link", { name: /买家管理/ }).click();
    await page.waitForSelector('input[placeholder*="搜索"]', { timeout: 15_000 });
    await page.waitForSelector('a[href^="/admin/buyers/"]', { timeout: 15_000 });
    await page.waitForTimeout(400);
    const buyerLinks = await page.locator('a[href^="/admin/buyers/"]').count();
    ok("买家列表有数据", buyerLinks > 0, `rows=${buyerLinks}`);
    if (buyerLinks > 0) {
      await page.locator('a[href^="/admin/buyers/"]').first().click();
      await page.waitForSelector("text=首次接触归因", { timeout: 15_000 });
      await page.waitForTimeout(800);
      ok("买家详情渲染", true);
      await page.screenshot({ path: "/tmp/m5-admin-buyer.png" });
      await page.getByRole("link", { name: "← 买家列表" }).click();
      await page.waitForSelector('input[placeholder*="搜索"]', { timeout: 15_000 });
    }
    // 搜索交互
    await page.locator("input").first().fill("m5admin");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    const hit = await page.locator(`text=${ADMIN_EMAIL}`).count();
    ok("买家搜索命中测试账号", hit > 0);

    await page.getByRole("link", { name: /订单管理/ }).click();
    await page.waitForSelector("text=推进到", { timeout: 15_000 });
    await page.getByRole("button", { name: "待付款" }).click();
    await page.waitForTimeout(900);
    ok("订单状态筛选点击无报错", errs.length === 0, errs.join(" | ").slice(0, 200));
    await page.screenshot({ path: "/tmp/m5-admin-orders.png" });

    await page.getByRole("link", { name: /货源与成本/ }).click();
    await page.waitForSelector("text=严选库工厂", { timeout: 15_000 });
    await page.waitForTimeout(800);
    ok("健康页渲染", true);
    await page.screenshot({ path: "/tmp/m5-admin-health.png" });
    await ctx.close();
  }

  // ④ 负例：普通买家访问 /admin → 无权限页
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await ctx.addInitScript((t) => { localStorage.setItem("sb-token", t); localStorage.setItem("sb-lang", "zh"); }, b.token);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=此账号无管理权限", { timeout: 30_000 });
    ok("非管理员看到无权限页", true);
    await page.screenshot({ path: "/tmp/m5-admin-denied.png" });
    await ctx.close();
  }

  // ⑤ 移动端 390：驾驶舱不破版（允许横向滚动容器，但导航可用）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((t) => { localStorage.setItem("sb-token", t); localStorage.setItem("sb-lang", "zh"); }, a.token);
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=经营驾驶舱", { timeout: 30_000 });
    await page.waitForSelector("text=独立访客", { timeout: 30_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "/tmp/m5-admin-mobile.png" });
    ok("移动端 390 渲染无 JS 报错", errs.length === 0, errs.join(" | ").slice(0, 200));
    await ctx.close();
  }

  await browser.close();
} finally {
  // 清场：还原 .env → 重启 → 删测试账号与本次埋点
  fs.writeFileSync(ENV_PATH, envOrig);
  try { execSync("pkill -f 'node dist/boot' || true"); } catch { /* */ }
  await waitUp();
  for (const id of [adminId, plainId]) {
    if (!id) continue;
    await db.execute(dsql`DELETE FROM auth_sessions WHERE user_id=${id}`).catch(() => {});
    await db.execute(dsql`DELETE FROM users WHERE id=${id}`).catch(() => {});
  }
  await db.execute(
    dsql`DELETE FROM analytics_events WHERE path LIKE '/admin%' AND ts >= ${testStart}`
  ).catch(() => {});
  console.log(`\n清场完成（.env 已还原）。${pass} PASS / ${fail} FAIL`);
}
process.exit(fail ? 1 : 0);
