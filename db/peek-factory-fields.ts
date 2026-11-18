/** 入库前侦察：factories 表目标字段现状 + 既往采集入库情况 */
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const [cols] = (await db.execute(dsql`SHOW COLUMNS FROM factories`)) as unknown as [Array<{ Field: string }>];
  const names = cols.map((c) => c.Field);
  console.log("factories 列:", names.join(","));
  const targets = ["years", "repurchase_rate", "area_sqm", "employee_count", "oem_mode", "production_type", "deep_inspected", "monthly_buyers", "cert", "cards_checked_at"];
  for (const t of targets) {
    if (!names.includes(t)) { console.log(`  ${t}: 列不存在!`); continue; }
    const [r] = (await db.execute(dsql.raw(`SELECT COUNT(*) AS total, SUM(CASE WHEN ${t} IS NULL OR ${t}='' THEN 1 ELSE 0 END) AS empty FROM factories WHERE dup_of IS NULL AND is_trader=0`))) as unknown as [[{ total: number | string; empty: number | string | null }?]];
    console.log(`  ${t}: 总 ${r?.[0]?.total}，空 ${r?.[0]?.empty ?? 0}`);
  }
  // 既往入库痕迹
  if (names.includes("cards_checked_at")) {
    const [r2] = (await db.execute(dsql`SELECT COUNT(*) AS c FROM factories WHERE cards_checked_at IS NOT NULL`)) as unknown as [[{ c: number | string }?]];
    console.log("cards_checked_at 非空行数（既往已入库）:", r2?.[0]?.c);
  }
  // id 覆盖：jsonl 的 id 是否=factories.id，抽 3 个核对
  for (const id of [3, 5, 11]) {
    const [r3] = (await db.execute(dsql`SELECT id, name FROM factories WHERE id = ${id}`)) as unknown as [[{ id: number; name: string }?]];
    console.log(`  id=${id} 库内名:`, r3?.[0]?.name);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
