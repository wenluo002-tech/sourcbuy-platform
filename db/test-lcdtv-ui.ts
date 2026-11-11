// v79 浏览器实测：注册临时买家 → /buyer 发「我想采购一批液晶电视」→ 等商品卡 → 截图 → 清场
process.loadEnvFile();
import { chromium } from "playwright-core";
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";

const BASE = "http://localhost:3200";
const EMAIL = `lcdtv-${Date.now()}@test.dev`;
const PASS = "Test123456!";
const testStart = new Date();

async function trpc(path: string, body?: unknown, token?: string) {
  const r = await fetch(`${BASE}/api/trpc/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify({ json: body }),
  });
  return r.json();
}

const reg = await trpc("auth.register", { email: EMAIL, password: PASS, displayName: "演示验收" });
const token = reg?.result?.data?.json?.token;
if (!token) { console.log("FAIL 注册失败", JSON.stringify(reg).slice(0, 200)); process.exit(1); }
console.log("注册 OK:", EMAIL);

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
let pass = 0, fail = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  await ctx.addInitScript((t) => localStorage.setItem("sb-token", t), token);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/buyer`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("form input", { timeout: 20000 });
  // 发消息
  const box = page.locator("form input").last();
  await box.fill("我想采购一批液晶电视，55寸，发往美国");
  await box.press("Enter");
  // 等 AI 作业完成（「作业中」消失）再等商品卡：卡片带 US$ 折算价，进度清单没有这个词
  await page.waitForSelector("text=作业中", { state: "detached", timeout: 180000 }).catch(() => null);
  const sec = await page.waitForSelector("text=US$", { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(8000); // 卡片渲染+翻译沉降
  await page.screenshot({ path: "/tmp/v79-lcdtv-chat.png", fullPage: false });
  if (sec) { pass++; console.log("PASS 商品卡区块出现"); } else { fail++; console.log("FAIL 240s 内未出现商品卡"); }
  // 断言：页面文本里出现真电视标题特征（寸数+电视机），且无肇事配件词出现在卡片区
  const body = await page.evaluate(() => document.body.innerText);
  const hasTv = /电视机|英寸|寸.*4K|4K.*寸/.test(body);
  const hasAcc = /防尘罩|连接线|连接器|纸盆喇叭/.test(body);
  if (hasTv && !hasAcc) { pass++; console.log("PASS 对话页商品卡=真电视且无配件词"); }
  else { fail++; console.log("FAIL 商品卡内容不符", { hasTv, hasAcc }); }
  if (!errors.length) { pass++; console.log("PASS 页面零 JS 报错"); } else { fail++; console.log("FAIL JS 报错:", errors.join(";").slice(0, 200)); }
  await ctx.close();
} finally {
  await browser.close();
  // 清场：测试账号+事件
  const db = getDb();
  const u = (await db.execute(dsql`SELECT id FROM users WHERE email = ${EMAIL}`) as any)[0] ?? [];
  const uid = u[0]?.id;
  if (uid) {
    await db.execute(dsql`DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE user_id = ${uid})`);
    await db.execute(dsql`DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE user_id = ${uid})`);
    for (const t of ["chat_threads", "orders", "notifications", "recommendation_logs", "buyer_profiles", "auth_sessions"]) {
      await db.execute(dsql.raw(`DELETE FROM ${t} WHERE user_id = ${uid}`));
    }
    await db.execute(dsql`DELETE FROM users WHERE id = ${uid}`);
  }
  await db.execute(dsql`DELETE FROM analytics_events WHERE path LIKE '/buyer%' AND ts >= ${testStart}`);
  console.log("清场完成");
}
console.log(`===== 浏览器实测 ${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
