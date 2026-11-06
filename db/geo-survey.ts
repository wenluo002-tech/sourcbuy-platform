process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [s] = await db.execute(sql`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN province IS NULL OR province = '' THEN 1 ELSE 0 END) AS no_prov,
      SUM(CASE WHEN city IS NULL OR city = '' THEN 1 ELSE 0 END) AS no_city,
      SUM(CASE WHEN district IS NULL OR district = '' THEN 1 ELSE 0 END) AS no_dist
    FROM factories`) as any;
  console.log(JSON.stringify(s[0]));
  // location 与 city 不一致/为空的样本
  const [sample] = await db.execute(sql`
    SELECT id, name, location, province, city, district FROM factories
    WHERE city IS NULL OR city = '' LIMIT 12`) as any;
  for (const r of sample as any[]) console.log(JSON.stringify(r));
  // location 的形态分布（市/县/区？）
  const [loc] = await db.execute(sql`
    SELECT location, COUNT(*) AS c FROM factories GROUP BY location ORDER BY c DESC LIMIT 15`) as any;
  console.log("\nlocation 值样本:", (loc as any[]).map(r => `${r.location}:${r.c}`).join(" "));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
