process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [r] = await db.execute(sql`SELECT COUNT(DISTINCT location) AS c FROM factories`) as any;
  console.log("location 去重数:", r[0].c);
  const [all] = await db.execute(sql`SELECT DISTINCT location FROM factories ORDER BY location`) as any;
  console.log((all as any[]).map(x => x.location).join(" "));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
