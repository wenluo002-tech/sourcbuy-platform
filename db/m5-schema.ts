// M5 管理后台：建 analytics_events + users/orders 加归因列 + 历史回填（幂等，可重跑）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
const db = getDb();

await db.execute(`CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  event VARCHAR(32) NOT NULL,
  anon_id VARCHAR(64) NULL,
  user_id INT NULL,
  path VARCHAR(255) NULL,
  referrer VARCHAR(512) NULL,
  utm_source VARCHAR(64) NULL,
  utm_medium VARCHAR(64) NULL,
  utm_campaign VARCHAR(128) NULL,
  lang VARCHAR(8) NULL,
  ua VARCHAR(255) NULL,
  KEY idx_ev_ts (event, ts),
  KEY idx_anon (anon_id),
  KEY idx_src_ts (utm_source, ts),
  KEY idx_ts (ts)
)`);
console.log("analytics_events OK");

async function ensureColumn(table: string, col: string, ddl: string) {
  const [rows]: any = await db.execute(`SHOW COLUMNS FROM ${table} LIKE '${col}'`);
  if (!rows.length) { await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); console.log(`${table}.${col} 已加`); }
  else console.log(`${table}.${col} 已存在`);
}
await ensureColumn("users", "role", "role VARCHAR(16) NOT NULL DEFAULT 'buyer'");
await ensureColumn("users", "attr", "attr JSON NULL COMMENT '首次接触归因'");
await ensureColumn("orders", "accepted_at", "accepted_at DATETIME NULL COMMENT '接受报价时间（GMV 口径时点）'");
await ensureColumn("orders", "gmv_usd", "gmv_usd DECIMAL(12,2) NULL COMMENT '接受报价时 GMV 快照(USD)'");
await ensureColumn("orders", "attr", "attr JSON NULL COMMENT '成交时末次接触归因'");

// 历史回填：已进 pending_payment 及之后的订单，accepted_at≈updated_at（近似，口径脚注明说）、gmv_usd=quote.totalUsd
const [r]: any = await db.execute(`UPDATE orders SET accepted_at = updated_at, gmv_usd = CAST(JSON_UNQUOTE(JSON_EXTRACT(quote,'$.totalUsd')) AS DECIMAL(12,2))
  WHERE status IN ('pending_payment','sourcing','inspecting','shipped','received') AND accepted_at IS NULL AND quote IS NOT NULL`);
console.log("历史回填订单数:", r.affectedRows);
process.exit(0);
