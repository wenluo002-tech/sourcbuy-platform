process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [a] = await db.execute(sql`
    SELECT source, COUNT(*) AS n FROM factory_categories GROUP BY source`) as any;
  console.log("打标来源分布:", JSON.stringify(a));
  const [b] = await db.execute(sql`
    SELECT COUNT(*) AS calls, COALESCE(SUM(cost_cny),0) AS cost
    FROM sourcing_api_logs WHERE provider='wanbang' AND endpoint='item_search_factory' AND DATE(created_at)=CURDATE()`) as any;
  console.log("今日付费调用:", JSON.stringify((b as any[])[0]));
  const [c] = await db.execute(sql`
    SELECT COUNT(DISTINCT factory_id) AS tagged FROM factory_categories WHERE source='wbshop_v1'`) as any;
  console.log("付费层已标厂数:", JSON.stringify((c as any[])[0]));
  process.exit(0);
}
main();
