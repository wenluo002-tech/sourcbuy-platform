process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [pool]: any = await db.execute(sql`SELECT offer_id, member_id, seller_login_id FROM offer_pool WHERE member_id IS NOT NULL OR seller_login_id IS NOT NULL`);
  for (const r of pool) console.log(r.offer_id, "| memberId:", r.member_id, "| loginId:", r.seller_login_id);
  const [hit]: any = await db.execute(sql`
    SELECT p.offer_id, f.name FROM offer_pool p JOIN factories f ON f.member_id = p.member_id OR f.member_id = p.seller_login_id
    WHERE p.member_id IS NOT NULL OR p.seller_login_id IS NOT NULL`);
  console.log("\njoin 命中:", hit.length, hit);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
