/* 评分体系 v2 正式重算管线（2026-11-12 推翻重建）
   数据源唯一真理：contracts/scoring.ts 的 computeFactoryScore（规则公开、全部映射自实抓字段）
   默认 dry-run 只读不写；--execute 落库：
     - factory_scores：六维子分（cert→quality_cert 列、audit→audit 列、rep→repurchase、year→trust_years、sales→sales、prod→production）
       + composite + confidence + computed_at；旧 7 维遗留列 factory_power/service 不动（仅历史保留）
     - factories.score / factories.tier：按 v2 结果覆盖（旧口径已废弃，这是推翻重建的正式切换）
   范围：正式厂（is_trader=0 AND dup_of IS NULL）；贸易商/重复店铺不动，永不进推荐
   用法：npx tsx db/rescore-v2.ts ｜ npx tsx db/rescore-v2.ts --execute */
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { computeFactoryScore, SCORING_FORMULA } from "../contracts/scoring";

const EXECUTE = process.argv.includes("--execute");
const db = getDb();

const [rows]: any = await db.execute(sql`
  SELECT f.id, f.name, f.score AS old_score, f.tier AS old_tier, f.cert, f.is_super, f.deep_inspected,
    f.years, f.repurchase_rate, f.monthly_buyers, f.area_sqm, f.employee_count, f.production_type,
    (f.images IS NOT NULL AND CHAR_LENGTH(f.images) > 10) AS has_imgs
  FROM factories f WHERE f.is_trader=0 AND f.dup_of IS NULL`);

const [scoreRows]: any = await db.execute(sql`SELECT factory_id FROM factory_scores`);
const hasRow = new Set<number>(scoreRows.map((r: any) => Number(r.factory_id)));

const dist: Record<string, number> = { 金标: 0, 银标: 0, 铜标: 0, 优选: 0, 培育: 0 };
const transitions: Record<string, number> = {};
let sum = 0, cnt = 0, noScore = 0, changed = 0;
const movers: any[] = [];
type Write = { id: number; r: ReturnType<typeof computeFactoryScore> };
const writes: Write[] = [];

for (const row of rows) {
  const r = computeFactoryScore({
    cert: row.cert,
    isSuper: row.is_super,
    deepInspected: row.deep_inspected,
    hasImages: !!row.has_imgs,
    years: row.years == null ? null : Number(row.years),
    repurchaseRate: row.repurchase_rate == null ? null : Number(row.repurchase_rate),
    monthlyBuyers: row.monthly_buyers == null ? null : Number(row.monthly_buyers),
    productionType: row.production_type,
    areaSqm: row.area_sqm == null ? null : Number(row.area_sqm),
    employeeCount: row.employee_count == null ? null : Number(row.employee_count),
  });
  dist[r.tier]++;
  if (r.score != null) { sum += r.score; cnt++; } else noScore++;
  const oldKey = `${row.old_tier ?? "无"}→${r.tier}`;
  transitions[oldKey] = (transitions[oldKey] ?? 0) + 1;
  const oldScore = row.old_score == null ? null : Number(row.old_score);
  const scoreChanged = oldScore !== r.score;
  const tierChanged = (row.old_tier ?? null) !== r.tier;
  if (scoreChanged || tierChanged) {
    changed++;
    movers.push({ id: row.id, name: String(row.name).slice(0, 14), old: `${row.old_score}/${row.old_tier}`, new: `${r.score}/${r.tier}`, cov: r.coverage, delta: oldScore != null && r.score != null ? Math.round((r.score - oldScore) * 10) / 10 : null });
  }
  writes.push({ id: Number(row.id), r });
}

console.log(`=== v2 ${EXECUTE ? "落库执行" : "dry-run（只读）"}｜正式厂 ${rows.length} 家 ===`);
console.log("分布：", dist, `｜有分 ${cnt} 均分 ${(sum / cnt).toFixed(1)}｜数据太薄不出分 ${noScore}`);
console.log(`变动 ${changed} 家（分数或档位其一变化）`);
console.log("=== 档位迁移矩阵（旧→新）===");
for (const [k, v] of Object.entries(transitions).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log("=== 升幅 TOP8 ===");
for (const m of movers.filter((x) => x.delta != null).sort((a, b) => b.delta - a.delta).slice(0, 8)) console.log(" ", JSON.stringify(m));
console.log("=== 降幅 TOP8 ===");
for (const m of movers.filter((x) => x.delta != null).sort((a, b) => a.delta - b.delta).slice(0, 8)) console.log(" ", JSON.stringify(m));
console.log("=== 金标名单抽样（塔尖安全性人工复核入口）===");
const golds = writes.filter((w) => w.r.tier === "金标").slice(0, 5);
for (const g of golds) console.log(" ", g.id, JSON.stringify(g.r.dims), `cov=${g.r.coverage}`);

if (!EXECUTE) {
  console.log("\n[dry-run] 未写库。确认无误后加 --execute 正式切换。");
  process.exit(0);
}

// ── 落库：集合操作分块（CASE 批量 UPDATE + 多行 INSERT），失败即抛（不留半成品静默） ──
const num = (v: number | null) => (v == null ? sql`NULL` : sql`${v}`);
const str = (v: string | null) => (v == null ? sql`NULL` : sql`${v}`);
function caseById(pairs: { id: number; v: number | string | null }[], isStr = false, col = "factory_id") {
  const map = (p: { id: number; v: any }) => sql`WHEN ${p.id} THEN ${isStr ? str(p.v) : num(p.v)}`;
  return sql`CASE ${sql.raw(col)} ${sql.join(pairs.map(map), sql` `)} END`;
}
const idIn = (ids: number[], col = "factory_id") =>
  sql`${sql.raw(col)} IN (${sql.join(ids.map((i) => sql`${i}`), sql`,`)})`;
let upScore = 0, upFactory = 0;
const CHUNK = 200;
for (let i = 0; i < writes.length; i += CHUNK) {
  const part = writes.slice(i, i + CHUNK);
  const existing = part.filter((w) => hasRow.has(w.id));
  const fresh = part.filter((w) => !hasRow.has(w.id));
  if (existing.length) {
    const ids = existing.map((w) => w.id);
    await db.execute(sql`UPDATE factory_scores SET
      quality_cert=${caseById(existing.map((w) => ({ id: w.id, v: w.r.dims.cert })))},
      audit=${caseById(existing.map((w) => ({ id: w.id, v: w.r.dims.audit })))},
      repurchase=${caseById(existing.map((w) => ({ id: w.id, v: w.r.dims.rep })))},
      trust_years=${caseById(existing.map((w) => ({ id: w.id, v: w.r.dims.year })))},
      sales=${caseById(existing.map((w) => ({ id: w.id, v: w.r.dims.sales })))},
      production=${caseById(existing.map((w) => ({ id: w.id, v: w.r.dims.prod })))},
      composite=${caseById(existing.map((w) => ({ id: w.id, v: w.r.score })))},
      confidence=${caseById(existing.map((w) => ({ id: w.id, v: w.r.confidence })), true)},
      computed_at=NOW()
      WHERE ${idIn(ids)}`);
    upScore += existing.length;
  }
  if (fresh.length) {
    const values = fresh.map(
      (w) => sql`(${w.id}, ${num(w.r.dims.cert)}, ${num(w.r.dims.audit)}, ${num(w.r.dims.rep)}, ${num(w.r.dims.year)}, ${num(w.r.dims.sales)}, ${num(w.r.dims.prod)}, ${num(w.r.score)}, ${str(w.r.confidence)}, NOW())`
    );
    await db.execute(sql`INSERT INTO factory_scores (factory_id, quality_cert, audit, repurchase, trust_years, sales, production, composite, confidence, computed_at)
      VALUES ${sql.join(values, sql`,`)}`);
    upScore += fresh.length;
  }
  const ids = part.map((w) => w.id);
  await db.execute(sql`UPDATE factories SET
    score=${caseById(part.map((w) => ({ id: w.id, v: w.r.score })), false, "id")},
    tier=${caseById(part.map((w) => ({ id: w.id, v: w.r.tier })), true, "id")}
    WHERE ${idIn(ids, "id")}`);
  upFactory += part.length;
  console.log(`  …进度 ${Math.min(i + CHUNK, writes.length)}/${writes.length}`);
}
console.log(`\n[execute] 完成：factory_scores 写入 ${upScore} 行，factories.score/tier 更新 ${upFactory} 行。体系版本 ${SCORING_FORMULA.version}（${SCORING_FORMULA.effectiveDate} 生效）`);
process.exit(0);
