// 选择理由面板截图：造 quoted 单 → 订单详情 → 点"接受报价" → 面板弹出 → 截图 → 清理
import { chromium } from "playwright-core";
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { transitionOrder } from "../api/queries/orders";

const BASE = "http://localhost:3200";
const EMAIL = "m4atest1794109068991@test.com";
const db: any = getDb();

// 造一单 quoted（走完直接取消，不留垃圾）
const [u]: any = await db.execute(dsql`SELECT id FROM users WHERE email=${EMAIL} LIMIT 1`);
const uid = u[0].id;
const [ins]: any = await db.execute(dsql`
  INSERT INTO orders (order_no, user_id, product_title, quantity, destination, status, created_at)
  VALUES (${"SBSHOT" + Date.now().toString(36).toUpperCase()}, ${uid}, 'yoga pants', 500, 'Los Angeles', 'inquiry', NOW())`);
const oid = Number(ins.insertId);
await transitionOrder({ orderId: oid, to: "quoted", actor: "ops", quote: { goodsTotalCny: 3400, totalUsd: 550, commissionUsd: 30, commissionRate: 0.06, fxRate: 6.34, etaDays: "18-22", quotedAt: new Date().toISOString() } });
console.log("quoted order:", oid);

const login = await fetch(`${BASE}/api/trpc/auth.login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: { email: EMAIL, password: "Test1234!" } }) });
const cookie = login.headers.get("set-cookie") || "";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });

for (const vp of [{ width: 1440, height: 900, tag: "pc" }, { width: 390, height: 844, tag: "m" }]) {
  const ctx = await browser.newContext({ viewport: vp, locale: "zh-CN" });
  const [pair] = cookie.split(";"); const [k, v] = pair.split("=");
  await ctx.addCookies([{ name: k, value: v, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/orders/${oid}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  // 点"接受报价"展开选择理由面板
  const btn = page.locator("button", { hasText: "接受报价" }).first();
  await btn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/why-panel-${vp.tag}.png`, fullPage: false });
  console.log(`shot ${vp.tag} ok`);
  await ctx.close();
}
await browser.close();

// 清理
await db.execute(dsql`DELETE FROM order_events WHERE order_id=${oid}`);
await db.execute(dsql`DELETE FROM orders WHERE id=${oid}`);
console.log("cleaned");
process.exit(0);
