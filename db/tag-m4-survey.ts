process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const [cols] = await db.execute(sql`SHOW COLUMNS FROM factory_categories`) as any;
  console.log("factory_categories 列:", (cols as any[]).map(c => c.Field).join(", "));
  const [sample] = await db.execute(sql`SELECT * FROM factory_categories LIMIT 3`) as any;
  console.log("样例:", JSON.stringify(sample));
  // 未打标厂与产品池的交集（三键 join）
  const [poolHit] = await db.execute(sql`
    SELECT COUNT(DISTINCT f.id) AS c FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)
      AND EXISTS (
        SELECT 1 FROM offer_pool p
        WHERE p.member_id = f.member_id
           OR p.seller_login_id = f.member_id
           OR (f.seller_user_id IS NOT NULL AND p.seller_user_id = f.seller_user_id)
      )`) as any;
  console.log("未打标厂中产品池有货的:", poolHit[0].c);
  const [pcols] = await db.execute(sql`SHOW COLUMNS FROM offer_pool`) as any;
  console.log("offer_pool 列:", (pcols as any[]).map(c => c.Field).join(", "));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
