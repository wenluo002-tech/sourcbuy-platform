process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  // 中山工厂总量与梯队（排除贸易商，与前台口径一致）
  const [total] = await db.execute(sql`SELECT COUNT(*) AS c FROM factories WHERE location LIKE '%中山%' AND is_trader = 0`) as any;
  const [tiers] = await db.execute(sql`SELECT tier, COUNT(*) AS c FROM factories WHERE location LIKE '%中山%' AND is_trader = 0 GROUP BY tier ORDER BY c DESC`) as any;
  console.log("中山源头工厂总数:", total[0].c);
  console.log("梯队分布:", (tiers as any[]).map(t => `${t.tier}:${t.c}`).join(" "));
  // 中山厂的类目分布
  const [cats] = await db.execute(sql`
    SELECT c.category, COUNT(DISTINCT c.factory_id) AS c FROM factory_categories c
    JOIN factories f ON f.id = c.factory_id
    WHERE f.location LIKE '%中山%' AND f.is_trader = 0
    GROUP BY c.category ORDER BY c DESC`) as any;
  console.log("\n中山厂类目分布:");
  for (const r of cats as any[]) console.log(`  ${r.category}: ${r.c} 家`);
  // 中山 TOP8 高分厂
  const [top] = await db.execute(sql`
    SELECT id, name, tier, score, years, city, district FROM factories
    WHERE location LIKE '%中山%' AND is_trader = 0 ORDER BY score DESC LIMIT 8`) as any;
  console.log("\n中山 TOP8 高分厂:");
  for (const r of top as any[]) console.log(`  #${r.id} ${r.name} | ${r.tier} ${r.score}分 | ${r.years}年 | ${r.district || r.city}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
