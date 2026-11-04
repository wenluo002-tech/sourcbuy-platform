process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [r]: any = await db.execute(sql`
    SELECT
      SUM(CASE WHEN member_id LIKE 'b2b-%' THEN 1 ELSE 0 END) AS b2b,
      SUM(CASE WHEN member_id LIKE 'shop%' THEN 1 ELSE 0 END) AS shop,
      SUM(CASE WHEN member_id NOT LIKE 'b2b-%' AND member_id NOT LIKE 'shop%' THEN 1 ELSE 0 END) AS legacy,
      COUNT(*) total FROM factories`);
  console.log(r[0]);
  const [s]: any = await db.execute(sql`SELECT member_id FROM factories WHERE member_id NOT LIKE 'b2b-%' AND member_id NOT LIKE 'shop%' LIMIT 8`);
  console.log("legacy 样本:", s.map((x: any) => x.member_id).join(", "));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
