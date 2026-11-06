process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const [total] = await db.execute(sql`SELECT COUNT(*) AS c FROM factories`) as any;
  const [tagged] = await db.execute(sql`SELECT COUNT(DISTINCT factory_id) AS c FROM factory_categories`) as any;
  const [untagged] = await db.execute(sql`
    SELECT COUNT(*) AS c FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)`) as any;
  console.log("factories 总数:", total[0].c);
  console.log("已打标厂数:", tagged[0].c);
  console.log("未打标厂数:", untagged[0].c);
  const [sample] = await db.execute(sql`
    SELECT f.id, f.name, LEFT(COALESCE(f.review,''), 100) AS review, LEFT(COALESCE(f.tags,''), 100) AS tags
    FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)
    LIMIT 8`) as any;
  console.log("\n未打标样本:");
  for (const r of sample as any[]) console.log(JSON.stringify(r));
  const [fill] = await db.execute(sql`
    SELECT
      SUM(CASE WHEN review IS NOT NULL AND review != '' THEN 1 ELSE 0 END) AS has_review,
      SUM(CASE WHEN tags IS NOT NULL AND tags != '' THEN 1 ELSE 0 END) AS has_tags
    FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)`) as any;
  console.log("\n未打标厂字段完整度:", JSON.stringify(fill[0]));
  const [cols] = await db.execute(sql`SHOW COLUMNS FROM factories`) as any;
  console.log("\nfactories 列:", (cols as any[]).map(c => c.Field).join(", "));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
