process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const r: any = await db.execute(sql`UPDATE factories SET seller_user_id = NULL WHERE seller_user_id IS NOT NULL`);
  console.log("cleared factories.seller_user_id:", r[0]?.affectedRows);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
