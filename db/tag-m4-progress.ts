process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [t] = await db.execute(sql`SELECT COUNT(DISTINCT factory_id) AS c FROM factory_categories WHERE source = 'wbshop_v1'`) as any;
  const [log] = await db.execute(sql`SELECT COUNT(*) AS calls, COALESCE(SUM(CAST(cost_cny AS DECIMAL(10,4))),0) AS cost FROM sourcing_api_logs WHERE endpoint = 'item_search_factory' AND DATE(created_at) = CURDATE()`) as any;
  const [left] = await db.execute(sql`SELECT COUNT(*) AS c FROM factories f WHERE f.is_trader = 0 AND NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)`) as any;
  console.log(`付费层已打标: ${t[0].c} 家 | 今日万邦调用: ${log[0].calls} 次 / ¥${Number(log[0].cost).toFixed(2)} | 剩余未打标: ${left[0].c} 家`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
