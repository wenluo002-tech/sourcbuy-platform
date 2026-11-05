// 雷达卡加 Google Trends 趋势标注列（手动建列，幂等）
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
for (const ddl of [
  `ALTER TABLE radar_items ADD COLUMN trend_direction VARCHAR(12) NULL`,
  `ALTER TABLE radar_items ADD COLUMN trend_checked_at VARCHAR(16) NULL`,
]) {
  try { await db.execute(sql.raw(ddl)); console.log("OK:", ddl.slice(0, 60)); }
  catch (e: any) { console.log(e.message?.includes("Duplicate column") ? "已存在，跳过" : "ERR " + e.message); }
}
process.exit(0);
