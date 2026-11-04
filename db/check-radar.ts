import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [rows]: any = await db.execute(sql`SELECT title, upstream_count, factory_price_min, factory_price_max, vetted_count, top_sales FROM radar_items ORDER BY sort_order`);
  for (const r of rows) console.log(r.title, '|', r.upstream_count, '|', r.factory_price_min, '-', r.factory_price_max, '| 严选', r.vetted_count, '| 销', r.top_sales);
  const [f]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE score >= 85`);
  console.log('factories>=85:', f[0].c);
  const [h]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE name LIKE '%加湿器%' OR review LIKE '%加湿器%'`);
  console.log('加湿器 match:', h[0].c);
  const [y]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE name LIKE '%瑜伽垫%' OR review LIKE '%瑜伽垫%'`);
  console.log('瑜伽垫 match:', y[0].c);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
