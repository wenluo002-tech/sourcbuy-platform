process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [rows] = await db.execute(sql`
    SELECT p.offer_id, LEFT(p.title,26) t, p.cat_path, p.weight_g, f.name
    FROM offer_pool p LEFT JOIN factories f ON f.seller_user_id=p.seller_user_id
    WHERE p.cat_path IS NOT NULL LIMIT 10`) as any;
  for (const r of rows as any[]) console.log(JSON.stringify(r));
  const [c] = await db.execute(sql`SELECT COUNT(*) n, SUM(weight_g IS NOT NULL) w FROM offer_pool WHERE cat_path IS NOT NULL`) as any;
  console.log("已富化:", JSON.stringify((c as any[])[0]));
  process.exit(0);
}
main();
