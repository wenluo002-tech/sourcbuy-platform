// 地区字段规范化：province/city/district 回填 + 脏 location 清洗 + 厂名反查兜底
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { GEO, GEO_DIRTY } from "./geo-map";
async function main() {
  const db = getDb();
  let mapped = 0, dirty = 0, unmapped = new Set<string>();
  // 1) 正规映射
  for (const [loc, geo] of Object.entries(GEO)) {
    if (!geo) continue;
    const [r]: any = await db.execute(sql`
      UPDATE factories SET province = ${geo[0]}, city = ${geo[1]}, district = ${geo[2]}
      WHERE location = ${loc}`);
    mapped += Number(r.affectedRows ?? 0);
  }
  // 2) 脏值：location 置 NULL
  for (const d of GEO_DIRTY) {
    const [r]: any = await db.execute(sql`UPDATE factories SET location = NULL WHERE location = ${d}`);
    dirty += Number(r.affectedRows ?? 0);
  }
  // 3) 厂名反查兜底：location 为 NULL 的，从 name 里找地区词（县/市名优先长的先匹配）
  const locs = Object.keys(GEO).filter(k => GEO[k]).sort((a, b) => b.length - a.length);
  const [nulls] = await db.execute(sql`SELECT id, name FROM factories WHERE location IS NULL`) as any;
  let rescued = 0;
  for (const f of nulls as any[]) {
    const hit = locs.find(l => f.name.includes(l.replace(/市$|县$/, "")));
    if (hit && GEO[hit]) {
      const g = GEO[hit]!;
      await db.execute(sql`UPDATE factories SET location = ${hit}, province = ${g[0]}, city = ${g[1]}, district = ${g[2]} WHERE id = ${f.id}`);
      rescued++;
    }
  }
  // 4) 查漏：映射表没覆盖的非空 location
  const [left] = await db.execute(sql`SELECT DISTINCT location FROM factories WHERE province IS NULL AND location IS NOT NULL`) as any;
  for (const r of left as any[]) unmapped.add(r.location);
  // 5) 最终覆盖率
  const [s] = await db.execute(sql`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN province IS NOT NULL THEN 1 ELSE 0 END) AS has_prov,
      SUM(CASE WHEN city IS NOT NULL THEN 1 ELSE 0 END) AS has_city,
      SUM(CASE WHEN district IS NOT NULL THEN 1 ELSE 0 END) AS has_dist
    FROM factories`) as any;
  console.log(`映射回填 ${mapped} 家 | 脏值清洗 ${dirty} 条 | 厂名反查救回 ${rescued} 家`);
  console.log("覆盖率:", JSON.stringify(s[0]));
  if (unmapped.size) console.log("映射表漏网的 location:", [...unmapped].join(" "));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
