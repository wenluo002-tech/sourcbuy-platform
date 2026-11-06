process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [rows] = await db.execute(sql`
    SELECT id, name, province, city, district FROM factories
    WHERE district IS NOT NULL AND district != '' ORDER BY id LIMIT 8`) as any;
  for (const r of rows as any[]) console.log(JSON.stringify(r));
  const [ss] = await db.execute(sql`
    SELECT id, name, province, city, district FROM factories WHERE name LIKE '%石狮%' LIMIT 5`) as any;
  console.log("--- 石狮:");
  for (const r of ss as any[]) console.log(JSON.stringify(r));
  const [cov] = await db.execute(sql`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN province IS NOT NULL AND province != '' THEN 1 ELSE 0 END) AS has_prov,
      SUM(CASE WHEN city IS NOT NULL AND city != '' THEN 1 ELSE 0 END) AS has_city,
      SUM(CASE WHEN district IS NOT NULL AND district != '' THEN 1 ELSE 0 END) AS has_dist
    FROM factories`) as any;
  console.log("--- 覆盖:", JSON.stringify((cov as any[])[0]));
  process.exit(0);
}
main();
