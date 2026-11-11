// M5 探查：users/orders 表现有列 + OPS_ADMIN_EMAILS + quote 快照结构
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
const db = getDb();

const [uCols]: any = await db.execute(`SHOW COLUMNS FROM users`);
console.log("users:", uCols.map((c: any) => c.Field).join(", "));
const [oCols]: any = await db.execute(`SHOW COLUMNS FROM orders`);
console.log("orders:", oCols.map((c: any) => c.Field).join(", "));
console.log("OPS_ADMIN_EMAILS:", process.env.OPS_ADMIN_EMAILS ?? "(未设)");
// 看一个已报价订单的 quote JSON 结构
const [rows]: any = await db.execute(`SELECT id, order_no, status, quote FROM orders WHERE quote IS NOT NULL ORDER BY id DESC LIMIT 1`);
if (rows.length) {
  const q = typeof rows[0].quote === "string" ? JSON.parse(rows[0].quote) : rows[0].quote;
  console.log("quote keys:", Object.keys(q), "\n样例:", JSON.stringify(q).slice(0, 400));
}
const [stats]: any = await db.execute(`SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM orders WHERE status='pending_payment') AS accepted`);
console.log("现状:", stats[0]);
process.exit(0);
