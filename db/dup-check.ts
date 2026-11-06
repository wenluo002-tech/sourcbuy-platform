process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [rows] = await db.execute(sql`
    SELECT f.id, f.name, f.member_id, f.score, f.tier, f.location,
      (SELECT COUNT(*) FROM factory_categories fc WHERE fc.factory_id=f.id) AS cats
    FROM factories f WHERE f.name IN (SELECT name FROM factories GROUP BY name HAVING COUNT(*)>1)
    ORDER BY f.name, f.score DESC`) as any;
  for (const r of rows as any[]) console.log(JSON.stringify(r));
  process.exit(0);
}
main();
