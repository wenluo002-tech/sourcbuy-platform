import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [rows]: any = await db.execute(sql`
    SELECT id, name, member_id, seller_user_id, years, repurchase_rate, near90d_sales, production_type, area_sqm, deep_inspected
    FROM factories WHERE id IN (401, 402, 403)`);
  for (const f of rows)
    console.log(`#${f.id} ${f.name}\n   member_id=${f.member_id} uid=${f.seller_user_id} 年限=${f.years} 回头率=${f.repurchase_rate} 近90天=${f.near90d_sales} 面积=${f.area_sqm} ptype=${f.production_type} 深检=${f.deep_inspected}`);
  const [dd]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE near90d_sales = '--'`);
  console.log("\nnear90d_sales='--' 行数:", dd[0].c);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
