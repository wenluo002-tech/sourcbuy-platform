process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [t] = await db.execute(sql`
    SELECT f.name, fc.category FROM factory_categories fc JOIN factories f ON f.id = fc.factory_id
    WHERE fc.source = 'wbshop_v1' ORDER BY fc.id DESC LIMIT 12`) as any;
  console.log("付费层已打标:");
  for (const r of t as any[]) console.log(" ", r.name, "→", r.category);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
