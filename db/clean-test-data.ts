// 一次性清场：删除历次 QA/验收脚本产生的测试账号及其全部关联数据（订单/事件/会话/通知等）。
// 依据：测试账号邮箱模式 qa-*@sourcbuy.test / *@test.dev / *@test.com，绝无真实买家使用。
// 起因：M5 驾驶舱上线后，41 单里 40 单是 QA 测试单（假 GMV $105,195），违反「不编数据」红线。
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";

process.loadEnvFile();
const db = getDb();

const [ids]: any = await db.execute(
  dsql`SELECT id FROM users WHERE email LIKE 'qa-%@sourcbuy.test' OR email LIKE '%@test.dev' OR email LIKE '%@test.com'`
);
const uidList = ids.map((r: any) => Number(r.id));
console.log(`命中测试账号 n=${uidList.length}`);
if (uidList.length === 0) { console.log("无需清理"); process.exit(0); }

const idList = uidList.join(",");
const q = (s: string) => dsql.raw(s);

// 先数后删，逐表报数
const steps: [string, string][] = [
  ["chat_messages", `DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM (SELECT id FROM chat_threads WHERE user_id IN (${idList})) t)`],
  ["chat_threads", `DELETE FROM chat_threads WHERE user_id IN (${idList})`],
  ["order_events", `DELETE FROM order_events WHERE order_id IN (SELECT id FROM (SELECT id FROM orders WHERE user_id IN (${idList})) o)`],
  ["orders", `DELETE FROM orders WHERE user_id IN (${idList})`],
  ["addresses", `DELETE FROM addresses WHERE user_id IN (${idList})`],
  ["notifications", `DELETE FROM notifications WHERE user_id IN (${idList})`],
  ["recommendation_logs", `DELETE FROM recommendation_logs WHERE user_id IN (${idList})`],
  ["buyer_profiles", `DELETE FROM buyer_profiles WHERE user_id IN (${idList})`],
  ["sourcing_sessions", `DELETE FROM sourcing_sessions WHERE user_id IN (${idList})`],
  ["auth_sessions", `DELETE FROM auth_sessions WHERE user_id IN (${idList})`],
  ["analytics_events", `DELETE FROM analytics_events WHERE user_id IN (${idList})`],
  ["users", `DELETE FROM users WHERE id IN (${idList})`],
];
for (const [tbl, stmt] of steps) {
  const r: any = await db.execute(q(stmt));
  console.log(`${tbl}: 删 ${r[0]?.affectedRows ?? "?"} 行`);
}

const [o]: any = await db.execute(dsql`SELECT COUNT(*) n, COALESCE(SUM(gmv_usd),0) gmv FROM orders`);
const [u]: any = await db.execute(dsql`SELECT COUNT(*) n FROM users`);
console.log(`\n清后台账：orders=${o[0].n}（GMV $${o[0].gmv}），users=${u[0].n}`);
process.exit(0);
