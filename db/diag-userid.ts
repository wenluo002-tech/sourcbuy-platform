process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [rows]: any = await db.execute(sql`SELECT offer_id, image, member_id FROM offer_pool WHERE member_id IS NOT NULL LIMIT 9`);
  for (const r of rows) {
    const m = String(r.image ?? "").match(/!!(\d{6,})/);
    const imgUid = m ? m[1] : null;
    const midUid = String(r.member_id).match(/^b2b-(\d{10,})/)?.[1] ?? null;
    console.log(r.offer_id, "| img userId:", imgUid, "| memberId内嵌:", imgUid && r.member_id?.includes(imgUid) ? "MATCH" : (midUid ?? "-"));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
