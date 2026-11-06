process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const [a] = await db.execute(sql`
    SELECT
      SUM(CASE WHEN f.seller_user_id IS NOT NULL AND f.seller_user_id != '' THEN 1 ELSE 0 END) AS has_uid,
      COUNT(*) AS total
    FROM factories f`) as any;
  console.log("全库 seller_user_id 覆盖:", JSON.stringify(a[0]));
  const [b] = await db.execute(sql`
    SELECT
      SUM(CASE WHEN f.seller_user_id IS NOT NULL AND f.seller_user_id != '' THEN 1 ELSE 0 END) AS has_uid,
      COUNT(*) AS total
    FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)`) as any;
  console.log("未打标厂 seller_user_id 覆盖:", JSON.stringify(b[0]));
  const [c] = await db.execute(sql`
    SELECT COUNT(DISTINCT f.id) AS c FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)
      AND f.seller_user_id IS NOT NULL AND f.seller_user_id != ''
      AND EXISTS (SELECT 1 FROM offer_pool p WHERE p.seller_user_id = f.seller_user_id)`) as any;
  console.log("未打标厂经 seller_user_id 命中产品池:", c[0].c);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
