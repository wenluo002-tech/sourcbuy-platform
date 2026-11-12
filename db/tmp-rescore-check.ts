/* 本批 95 家评分子分完备度 + 锁定公式一致性校验（跑完即删） */
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();

const W: Record<string, number> = { quality_cert: 0.15, factory_power: 0.15, trust_years: 0.12, repurchase: 0.12, production: 0.10, service: 0.10, sales: 0.13 };

const [rows]: any = await db.execute(sql`
  SELECT f.id, f.score, f.tier, s.quality_cert, s.factory_power, s.trust_years, s.repurchase, s.production, s.service, s.sales, s.composite
  FROM factories f LEFT JOIN factory_scores s ON s.factory_id = f.id
  WHERE f.id BETWEEN 1220 AND 1325 AND f.cards_checked_at IS NOT NULL`);

let full = 0, partial = 0, none = 0, mismatch = 0;
const changes: any[] = [];
for (const r of rows) {
  const subs = ["quality_cert","factory_power","trust_years","repurchase","production","service","sales"]
    .map((k) => (r[k] != null ? Number(r[k]) : null));
  const have = subs.filter((v) => v != null).length;
  if (have === 7) full++; else if (have === 0) none++; else partial++;
  // 锁定公式重算（wsum<0.5 → null 培育档口径）
  let acc = 0, wsum = 0;
  ["quality_cert","factory_power","trust_years","repurchase","production","service","sales"].forEach((k, i) => {
    if (subs[i] != null) { acc += subs[i]! * W[k]; wsum += W[k]; }
  });
  const recomputed = wsum >= 0.5 ? Math.round(((acc + 3.9) / (0.61 + 3.9) * 100) * 10) / 10 : null;
  // 注意：上面是"维度分 0-100 制"的直接加权；先不对分制做假设，只对比 composite 字段
  if (r.composite != null && recomputed != null && Math.abs(Number(r.composite) - recomputed) > 1) mismatch++;
  if (recomputed != null && r.score != null && Math.abs(recomputed - Number(r.score)) > 0.5) {
    changes.push({ id: r.id, old: r.score, oldTier: r.tier, new: recomputed });
  }
}
console.log(`子分完备: 全7维=${full} 部分=${partial} 全无=${none} / 共${rows.length}`);
console.log(`composite 与锁定公式不一致: ${mismatch}`);
console.log(`综合分变动>0.5 的厂: ${changes.length}`);
console.log(changes.slice(0, 10));
process.exit(0);
