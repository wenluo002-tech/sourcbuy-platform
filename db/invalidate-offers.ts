process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const r: any = await db.execute(sql`UPDATE offers SET fetched_at = DATE_SUB(NOW(), INTERVAL 48 HOUR) WHERE member_id IS NULL AND seller_login_id IS NULL`);
  console.log("invalidated offers rows:", r[0]?.affectedRows);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
