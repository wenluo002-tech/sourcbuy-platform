/** 入库结果核验：抽查回填是否真实落库 */
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [a] = (await db.execute(dsql`SELECT COUNT(*) AS c FROM factories WHERE cards_checked_at >= '2026-11-18'`)) as unknown as [[{ c: number | string }?]];
  console.log("cards_checked_at >= 11-18 的行数:", a?.[0]?.c);
  const [b] = (await db.execute(dsql`SELECT COUNT(*) AS c FROM factories WHERE near90d_sales IS NOT NULL AND near90d_sales != ''`)) as unknown as [[{ c: number | string }?]];
  console.log("near90d_sales 非空总行数:", b?.[0]?.c);
  const [c2] = (await db.execute(dsql`SELECT COUNT(*) AS c FROM factories WHERE deep_inspected = 1`)) as unknown as [[{ c: number | string }?]];
  console.log("deep_inspected=1 总行数:", c2?.[0]?.c);
  const [d] = (await db.execute(dsql`SELECT id, near90d_sales, deep_inspected, cards_checked_at FROM factories WHERE id IN (3,5,11) `)) as unknown as [unknown[]];
  console.log(JSON.stringify(d, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
