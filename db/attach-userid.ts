process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [del]: any = await db.execute(sql`DELETE FROM offer_pool WHERE offer_id IS NULL OR offer_id = ''`);
  console.log("cleaned empty offer_id rows:", del[0]?.affectedRows);

  const [rows]: any = await db.execute(sql`SELECT offer_id, image FROM offer_pool WHERE image IS NOT NULL`);
  let extracted = 0;
  for (const r of rows) {
    const m = String(r.image).match(/!!(\d{6,})/);
    if (!m || m[1].startsWith("461168")) continue;
    await db.execute(sql`UPDATE offer_pool SET seller_user_id = ${m[1]} WHERE offer_id = ${r.offer_id}`);
    extracted++;
  }
  console.log(`extracted userId: ${extracted}/${rows.length}`);

  const [hit]: any = await db.execute(sql`
    SELECT COUNT(*) c, COUNT(DISTINCT f.id) fc FROM offer_pool p JOIN factories f ON f.member_id LIKE CONCAT('b2b-', p.seller_user_id, '%')
    WHERE p.seller_user_id IS NOT NULL`);
  console.log("挂上严选厂的货源数:", hit[0].c, "涉及严选厂:", hit[0].fc);

  const [sample]: any = await db.execute(sql`
    SELECT p.title, p.sales, f.name, f.tier, f.score FROM offer_pool p JOIN factories f ON f.member_id LIKE CONCAT('b2b-', p.seller_user_id, '%')
    WHERE p.seller_user_id IS NOT NULL ORDER BY p.sales DESC LIMIT 10`);
  for (const s of sample) console.log(` ★ ${s.name} [${s.tier}/${s.score}分] ${String(s.title).slice(0, 32)} 销${s.sales}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
