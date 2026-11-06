process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const q = async (s: string) => (await db.execute(sql.raw(s)) as any)[0];
  // 1) factory_scores 子分真实性：是否全库同一个值
  const s1 = await q(`SELECT * FROM factory_scores LIMIT 2`);
  console.log("scores 样例:", JSON.stringify(s1));
  const distinct = await q(`SELECT COUNT(DISTINCT CONCAT_WS('|',COALESCE(quality_cert,''),COALESCE(factory_power,''),COALESCE(trust_years,''),COALESCE(repurchase,''),COALESCE(production,''),COALESCE(service,''),COALESCE(sales,''))) d FROM factory_scores`);
  console.log("子分组合去重数:", JSON.stringify(distinct));
  // 2) 非厂名头（专营/旗舰/专卖/个体）
  const shops = await q(`SELECT COUNT(*) c FROM factories WHERE is_trader=0 AND (name LIKE '%专营店%' OR name LIKE '%旗舰店%' OR name LIKE '%专卖店%' OR name LIKE '%门市部%' OR name LIKE '%经营部%' OR name LIKE '%商行%' OR name LIKE '%经销部%')`);
  console.log("疑似店铺非厂:", JSON.stringify(shops));
  const shopSample = await q(`SELECT id,name FROM factories WHERE is_trader=0 AND (name LIKE '%专营店%' OR name LIKE '%旗舰店%' OR name LIKE '%专卖店%' OR name LIKE '%门市部%' OR name LIKE '%经营部%' OR name LIKE '%经销部%') LIMIT 15`);
  for (const r of shopSample) console.log("  ", JSON.stringify(r));
  // 3) 同名重复明细（是否真重复：比 member_id）
  const dups = await q(`SELECT name, COUNT(*) c, COUNT(DISTINCT member_id) m FROM factories GROUP BY name HAVING c>1`);
  console.log("同名组数:", dups.length, "其中 member_id 也重复的组:", dups.filter((d:any)=>Number(d.m)<Number(d.c)).length);
  // 4) 完全不可匹配厂：无类目标签 + 产品池无货 + 名头无行业词（粗略=无标签且非 poolLinked）
  const unm = await q(`SELECT COUNT(*) c FROM factories f WHERE f.is_trader=0
    AND NOT EXISTS(SELECT 1 FROM factory_categories fc WHERE fc.factory_id=f.id)
    AND NOT EXISTS(SELECT 1 FROM offer_pool p WHERE p.seller_user_id=f.seller_user_id)`);
  console.log("无标签且无在册货:", JSON.stringify(unm));
  // 5) 类目分布
  const cats = await q(`SELECT fc.category, COUNT(*) c FROM factory_categories fc JOIN factories f ON f.id=fc.factory_id WHERE f.is_trader=0 GROUP BY fc.category ORDER BY c DESC`);
  console.log("类目分布:", JSON.stringify(cats));
  // 6) review 质量：过短或含占位
  const rev = await q(`SELECT COUNT(*) c FROM factories WHERE LENGTH(review)<40`);
  console.log("review<40字:", JSON.stringify(rev));
  const revSample = await q(`SELECT id, LEFT(review,80) r FROM factories WHERE LENGTH(review)<40 LIMIT 5`);
  for (const r of revSample) console.log("  ", JSON.stringify(r));
  process.exit(0);
}
main();
