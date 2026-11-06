process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [rows] = await db.execute(sql`SELECT tier, MIN(CAST(score AS DECIMAL(5,1))) mn, MAX(CAST(score AS DECIMAL(5,1))) mx, COUNT(*) c FROM factories GROUP BY tier ORDER BY mn DESC`) as any;
  for (const r of rows as any[]) console.log(JSON.stringify(r));
  process.exit(0);
}
main();
