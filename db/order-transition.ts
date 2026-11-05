// M3b 运营侧订单流转 CLI（M5 后台管理端上线前的过渡工具）
// 用法：
//   npx tsx db/order-transition.ts <orderId或单号> <目标状态> [备注]
//   报价：npx tsx db/order-transition.ts SB260105-ABCD quoted "已核价" --quote '{"exwUnitPriceCny":28.62,"goodsTotalCny":14310,"freightUsd":420,"dutyUsd":0,"commissionUsd":157.9,"commissionRate":0.07,"totalUsd":2835,"fxRate":6.34,"channel":"空派专线","etaDays":"8-12 天","note":"含 FDA 合规提醒"}'
// 状态机校验在 transitionOrder 里：非法流转一律拒绝，报价只允许 inquiry→quoted
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { transitionOrder } from "../api/queries/orders";
import { ORDER_STATUSES, type OrderStatus, type OrderQuote } from "../contracts/orderFlow";

const [key, toRaw, ...rest] = process.argv.slice(2);
if (!key || !toRaw) {
  console.error("用法: npx tsx db/order-transition.ts <orderId|单号> <状态> [备注] [--quote '<json>']");
  console.error("状态:", ORDER_STATUSES.join(" / "));
  process.exit(1);
}
const to = toRaw as OrderStatus;
if (!ORDER_STATUSES.includes(to)) {
  console.error(`非法状态: ${to}（可选：${ORDER_STATUSES.join(" / ")}）`);
  process.exit(1);
}
const qi = rest.indexOf("--quote");
const note = (qi >= 0 ? rest.slice(0, qi) : rest).join(" ") || undefined;
let quote: OrderQuote | undefined;
if (qi >= 0) {
  if (to !== "quoted") { console.error("--quote 只允许在 inquiry→quoted 时使用"); process.exit(1); }
  quote = JSON.parse(rest[qi + 1]);
  if (quote && !quote.quotedAt) quote.quotedAt = new Date().toISOString();
}

const db = await getDb();
const [rows]: any = await db.execute(
  /^\d+$/.test(key) ? sql`SELECT id, order_no, status FROM orders WHERE id = ${Number(key)}` : sql`SELECT id, order_no, status FROM orders WHERE order_no = ${key}`
);
if (!rows[0]) { console.error("订单不存在:", key); process.exit(1); }
const r = await transitionOrder({ orderId: Number(rows[0].id), to, actor: "ops", note, quote });
if (!r.ok) {
  console.error(`流转被拒：${r.error}${r.from ? `（${r.from} → ${r.to} 不在允许表）` : ""}`);
  process.exit(1);
}
console.log(`✓ ${rows[0].order_no}: ${r.from} → ${r.to}${note ? `（${note}）` : ""}`);
process.exit(0);
