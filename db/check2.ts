import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const q = async (s: string) => { const [r]: any = await db.execute(sql.raw(s)); return r[0]; };
  console.log('factories total:', (await q('SELECT COUNT(*) c FROM factories')).c);
  console.log('factory_categories rows:', (await q('SELECT COUNT(*) c FROM factory_categories')).c);
  console.log('衣架 any:', (await q("SELECT COUNT(*) c FROM factories WHERE name LIKE '%衣架%' OR review LIKE '%衣架%'")).c);
  console.log('瑜伽 any:', (await q("SELECT COUNT(*) c FROM factories WHERE name LIKE '%瑜伽%' OR review LIKE '%瑜伽%'")).c);
  console.log('纺织 any:', (await q("SELECT COUNT(*) c FROM factories WHERE name LIKE '%纺织%'")).c);
  const [cats]: any = await db.execute(sql`SELECT category, COUNT(*) c FROM factory_categories GROUP BY category ORDER BY c DESC LIMIT 20`);
  console.log(cats);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
