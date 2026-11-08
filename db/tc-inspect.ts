process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db: any = getDb();
const norm = (s: string) => (s ?? "").replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",");
const name = norm("慈溪市才越光伏科技有限公司");
const [rows]: any = await db.execute(
  sql`SELECT id, created_at FROM temp_factory_checks
      WHERE REPLACE(REPLACE(query_name,' ',''),'　','') = ${name} AND status='ok'
        AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY id DESC LIMIT 1`,
);
console.log("cache rows:", JSON.stringify(rows));
const [all]: any = await db.execute(sql`SELECT id, NOW() nowt, created_at, TIMESTAMPDIFF(MINUTE, created_at, NOW()) age_min FROM temp_factory_checks ORDER BY id DESC LIMIT 2`);
for (const r of all) console.log(JSON.stringify(r));
process.exit(0);
