import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [t]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE cards_checked_at IS NOT NULL`);
  console.log("① cards_checked_at 非空总数:", t[0].c, "（导入前 341）");
  const [seg]: any = await db.execute(sql`
    SELECT FLOOR((id-1)/100)*100+1 lo, COUNT(*) c FROM factories
    WHERE cards_checked_at IS NOT NULL GROUP BY 1 ORDER BY 1`);
  console.log("② 分段:", seg.map((r: any) => `${r.lo}+:${r.c}`).join("  "));
  // 抽查新段 3 家：字段质量
  const [rows]: any = await db.execute(sql`
    SELECT id, name, member_id, seller_user_id, years, repurchase_rate, near90d_sales, monthly_buyers, production_type, area_sqm, deep_inspected, tags
    FROM factories WHERE id IN (555, 700, 790)`);
  for (const f of rows) {
    const tags = Array.isArray(f.tags) ? f.tags : JSON.parse(f.tags ?? "[]");
    console.log(`③ #${f.id} ${f.name}`);
    console.log(`   member_id=${f.member_id} seller_uid=${f.seller_user_id} 年限=${f.years} 回头率=${f.repurchase_rate} 近90天=${f.near90d_sales} 月买家=${f.monthly_buyers}`);
    console.log(`   ptype=${f.production_type} 面积=${f.area_sqm} 深检=${f.deep_inspected} tags数=${tags.length} tags样例=${tags.slice(0,4).join("/")}`);
  }
  // near90d_sales 口径：不得是纯数字（纯数字说明被错误换算过）
  const [bad]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE near90d_sales REGEXP '^[0-9]+$'`);
  console.log("④ near90d_sales 纯数字行数（应为 0）:", bad[0].c);
  // 未匹配 11 家确认打了标记但未写数据
  const [um]: any = await db.execute(sql`
    SELECT id, name, cards_checked_at IS NOT NULL marked, near90d_sales FROM factories WHERE id IN (23,174,330,459,611,630,676,687,759,784,785)`);
  console.log("⑤ 未匹配 11 家（应 marked=1 且 near90d 为空）:");
  for (const r of um) console.log(`   #${r.id} ${r.name} marked=${r.marked} near90d=${r.near90d_sales}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
