process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const q = async (s: string) => (await db.execute(sql.raw(s)) as any)[0];
  const out: any = {};
  // 1) 总量与核心字段空值率
  const nullCols = ["member_id","slug","name","location","province","city","district","years","score","tier","medal","medal_level","is_super","is_power","cert","cert_note","employee_count","area_sqm","reply_rate","repurchase_rate","monthly_buyers","oem_mode","production_type","service_capability","product_count","home","main_image","images","seller_user_id","review","tags"];
  const parts = nullCols.map(c => `SUM(CASE WHEN ${c} IS NULL OR CAST(${c} AS CHAR) IN ('','[]','{}','null') THEN 1 ELSE 0 END) AS ${c.replace(/_/g,'')}`);
  const [nulls] = await q(`SELECT COUNT(*) AS total, ${parts.join(",")} FROM factories`);
  out.total = nulls.total;
  out.nullCounts = nulls;
  // 2) 评分子分覆盖
  const [fs] = await q(`SELECT COUNT(*) AS n FROM factory_scores`);
  out.scoresRows = fs.n;
  // 3) 类目标签覆盖（去贸易商）
  const [cat] = await q(`SELECT COUNT(DISTINCT factory_id) AS tagged FROM factory_categories fc JOIN factories f ON f.id=fc.factory_id WHERE f.is_trader=0`);
  const [nonTrader] = await q(`SELECT COUNT(*) AS n FROM factories WHERE is_trader=0`);
  out.nonTrader = nonTrader.n; out.taggedNonTrader = cat.tagged;
  // 4) 死图（无可访问 http 图）
  const [img] = await q(`SELECT COUNT(*) AS n FROM factories WHERE images IS NULL OR JSON_SEARCH(images,'one','http%') IS NULL`);
  out.deadImages = img.n;
  // 5) 重复嫌疑：同名
  const dup = await q(`SELECT name, COUNT(*) c FROM factories GROUP BY name HAVING c>1 ORDER BY c DESC LIMIT 10`);
  out.dupNames = dup;
  // 6) member_id 形态分布
  const mid = await q(`SELECT CASE WHEN member_id LIKE 'b2b-%' THEN 'b2b' WHEN member_id IS NULL OR member_id='' THEN 'empty' ELSE 'legacy' END AS k, COUNT(*) c FROM factories GROUP BY k`);
  out.memberIdShape = mid;
  // 7) score 分布 & 异常值
  const sc = await q(`SELECT MIN(score) mn, MAX(score) mx, AVG(score) av FROM factories`);
  out.scoreRange = sc[0];
  const badScore = await q(`SELECT COUNT(*) c FROM factories WHERE score IS NOT NULL AND (score<0 OR score>100)`);
  out.badScore = badScore[0].c;
  // 8) years 异常
  const badYears = await q(`SELECT COUNT(*) c FROM factories WHERE years IS NOT NULL AND (years<0 OR years>80)`);
  out.badYears = badYears[0].c;
  // 9) offer_pool 规模与 join 覆盖
  const [pool] = await q(`SELECT COUNT(*) n, COUNT(DISTINCT seller_user_id) uids FROM offer_pool`);
  out.pool = pool;
  const [linked] = await q(`SELECT COUNT(DISTINCT f.id) n FROM factories f JOIN offer_pool p ON p.seller_user_id=f.seller_user_id`);
  out.poolLinkedFactories = linked.n;
  // 10) tier 分布（去贸易商）
  const tiers = await q(`SELECT tier, COUNT(*) c FROM factories WHERE is_trader=0 GROUP BY tier ORDER BY c DESC`);
  out.tiers = tiers;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}
main();
