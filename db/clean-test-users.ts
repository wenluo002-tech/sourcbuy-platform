// 清理 QA/E2E 测试账号及其会话数据（真实买家数据绝不碰）
import { loadEnvFile } from "node:process";
try { loadEnvFile(); } catch {}
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
const db = getDb();
const [u]: any = await db.execute(sql`SELECT id FROM users WHERE email LIKE 'qa-%@sourcbuy.test' OR email LIKE 'qa2-%@sourcbuy.test' OR email LIKE 'e2e-%@sourcbuy.test'`);
const ids = (u as any[]).map((r) => r.id);
console.log("test users:", ids.length);
if (ids.length) {
  await db.execute(sql`DELETE FROM auth_sessions WHERE user_id IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`,`)})`);
  const [t]: any = await db.execute(sql`SELECT id FROM chat_threads WHERE user_id IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`,`)})`);
  const tids = (t as any[]).map((r) => r.id);
  if (tids.length) {
    await db.execute(sql`DELETE FROM chat_messages WHERE thread_id IN (${sql.join(tids.map((i: number) => sql`${i}`), sql`,`)})`);
    await db.execute(sql`DELETE FROM chat_threads WHERE id IN (${sql.join(tids.map((i: number) => sql`${i}`), sql`,`)})`);
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`,`)})`);
}
console.log("cleaned");
process.exit(0);
