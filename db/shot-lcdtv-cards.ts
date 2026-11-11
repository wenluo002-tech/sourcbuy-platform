process.loadEnvFile();
import { chromium } from "playwright-core";
import { sql as dsql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
const BASE = "http://localhost:3200";
const EMAIL = `shot-${Date.now()}@test.dev`;
const reg = await (await fetch(`${BASE}/api/trpc/auth.register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: { email: EMAIL, password: "Test123456!", displayName: "演示" } }) })).json();
const token = reg?.result?.data?.json?.token;
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  await ctx.addInitScript((t) => localStorage.setItem("sb-token", t), token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/buyer`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("form input", { timeout: 20000 });
  const box = page.locator("form input").last();
  await box.fill("我想采购一批液晶电视，55寸，发往美国");
  await box.press("Enter");
  await page.waitForSelector("text=作业中", { state: "detached", timeout: 180000 }).catch(() => null);
  await page.waitForSelector("text=US$", { timeout: 60000 });
  await page.waitForTimeout(6000);
  const first = page.locator("text=US$").first();
  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/v79-cards.png" });
  console.log("shot saved");
} finally {
  await browser.close();
  const db = getDb();
  const u = (await db.execute(dsql`SELECT id FROM users WHERE email = ${EMAIL}`) as any)[0] ?? [];
  const uid = u[0]?.id;
  if (uid) {
    await db.execute(dsql`DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE user_id = ${uid})`);
    await db.execute(dsql`DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE user_id = ${uid})`);
    for (const t of ["chat_threads", "orders", "notifications", "recommendation_logs", "buyer_profiles", "auth_sessions"]) await db.execute(dsql.raw(`DELETE FROM ${t} WHERE user_id = ${uid}`));
    await db.execute(dsql`DELETE FROM users WHERE id = ${uid}`);
  }
  console.log("清场完成");
}
process.exit(0);
