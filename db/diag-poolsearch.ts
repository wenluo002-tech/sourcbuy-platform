process.loadEnvFile();
import { searchOffers } from "../api/sourcing/offerService";
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  // 池里 title 含"衣架"的有几条
  const [c]: any = await db.execute(sql`SELECT COUNT(*) c FROM offer_pool WHERE title LIKE '%衣架%' AND sales > 0`);
  console.log("池内含'衣架':", c[0].c);
  // 直接调 searchOffers 看走哪条路(清掉30min缓存先看池)
  await db.execute(sql`DELETE FROM offer_search_cache WHERE query = '衣架'`);
  const r = await searchOffers("衣架", 1);
  console.log("searchOffers 衣架: source=", r.source, "items=", r.items.length);
  // 万邦刚入池的40条里,有没有严选厂的货
  const [v]: any = await db.execute(sql`
    SELECT p.offer_id, p.title, f.name FROM offer_pool p
    JOIN factories f ON f.member_id = p.member_id OR f.member_id = p.seller_login_id
      OR (p.seller_user_id IS NOT NULL AND f.member_id LIKE CONCAT('b2b-', p.seller_user_id, '%'))
    WHERE p.title LIKE '%衣架%' LIMIT 5`);
  console.log("衣架类严选厂货:", v.length);
  for (const x of v) console.log("  ★", x.name, String(x.title).slice(0, 30));
  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e?.message); process.exit(1); });
