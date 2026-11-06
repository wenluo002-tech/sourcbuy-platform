process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [src] = await db.execute(sql`SELECT source, COUNT(*) AS c, COUNT(DISTINCT factory_id) AS f FROM factory_categories GROUP BY source`) as any;
  console.log("标签来源分布:", JSON.stringify(src));
  const [left] = await db.execute(sql`
    SELECT COUNT(*) AS c FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)`) as any;
  console.log("仍未打标:", left[0].c);
  const [sp] = await db.execute(sql`
    SELECT f.name FROM factory_categories fc JOIN factories f ON f.id = fc.factory_id
    WHERE fc.source = 'name_v1' AND fc.category = '文具办公' LIMIT 8`) as any;
  console.log("文具办公新标抽查:", (sp as any[]).map(r => r.name).join(" / "));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
