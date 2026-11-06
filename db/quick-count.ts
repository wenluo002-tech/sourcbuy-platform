process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [r] = await db.execute(sql`SELECT COUNT(*) c FROM factories`) as any;
  const [s] = await db.execute(sql`SELECT COUNT(*) c FROM factory_scores`) as any;
  const [c] = await db.execute(sql`SELECT COUNT(*) c FROM factory_categories WHERE source='legacy_v1'`) as any;
  console.log("factories:", (r as any[])[0].c, "| scores:", (s as any[])[0].c, "| legacy_v1 cats:", (c as any[])[0].c);
  process.exit(0);
}
main();
