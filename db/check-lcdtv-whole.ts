process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
const db = getDb();
const rows = await db.execute(dsql`
  SELECT product_id, LEFT(title,40) AS t, price_cny, price_suspect, tier_legacy,
         (image IS NOT NULL AND image != '') AS has_img
  FROM legacy_products
  WHERE title LIKE '%液晶电视机%' OR (title LIKE '%液晶电视%' AND title NOT LIKE '%罩%' AND title NOT LIKE '%线%' AND title NOT LIKE '%连接器%' AND title NOT LIKE '%喇叭%' AND title NOT LIKE '%包装%')
  LIMIT 20`);
for (const r of (rows as any)[0] ?? rows) console.log(r);
process.exit(0);
