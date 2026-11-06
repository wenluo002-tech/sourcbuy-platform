// 旧权威库（7,019 家，罗总 2026-11-06 提供 CSV）合并进严选库。
// 纪律（沿用 crawler v2 红线）：默认 dry-run；缺失写 NULL 绝不填 0；评分只按锁定公式从子分重算；
// member_id 判唯一 + 公司名标准化二级聚类（Marvis 建议）；空名行跳过；同名不同会员ID=同公司多店，跳过并由 dup 扫描兜底。
// 用法: npx tsx db/import-legacy.ts [--execute]
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { GEO } from "./geo-map";

const EXECUTE = process.argv.includes("--execute");
const CSV_PATH = "/mnt/agents/upload/旧厂库.csv";

// 贸易商/店铺名头（与 migrate-trader + fix-shops 同口径）
const TRADER_WORDS = ["贸易", "供应链", "商贸", "商行", "电子商务", "跨境电商", "进出口", "外贸", "旗舰店", "专营店", "专卖店"];

// 旧品类 → 现有 18 桶（保守映射，无对应桶的一律不标，靠名称/点评直达兜底）
const CAT_MAP: Record<string, string> = {
  "运动户外": "户外运动", "宠物园艺": "宠物用品", "玩具": "玩具母婴", "母婴用品": "玩具母婴",
  "餐厨饮具": "厨房餐饮", "数码电脑": "电子数码", "办公用品": "文具办公",
  "家纺家饰": "家居日用", "居家用品": "家居日用", "收纳清洁": "家居日用",
  "美妆个护": "美妆个护", "服装服饰": "服装服饰", "服饰配饰": "服装服饰", "内衣": "服装服饰",
  "箱包皮具": "箱包皮具", "汽车用品": "汽车用品", "鞋靴": "鞋靴", "灯饰照明": "灯饰照明",
  "五金工具": "五金工具", "包装": "包装印刷",
};

const normName = (s: string) => s.trim().replace(/\s+/g, "").replace(/\(/g, "（").replace(/\)/g, "）");
const toNum = (s: string) => { const n = parseFloat(String(s).replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : null; };
const toInt = (s: string) => { const n = toNum(s); return n == null ? null : Math.round(n); };
const blank = (s: string) => s.trim() === "";

// 锁定评分公式（contracts/scoring.ts）：composite = Σ(维度×权重) + 3.9；维度缺失时按可用维度权重归一
const DIMS: [string, number][] = [
  ["quality_cert_score", 0.15], ["factory_power_score", 0.15], ["trust_years_score", 0.12],
  ["repurchase_score", 0.12], ["production_score", 0.10], ["service_score", 0.10], ["sales_score", 0.13],
];
const W_ALL = DIMS.reduce((a, [, w]) => a + w, 0); // 0.87
function composite(r: Record<string, string>): number | null {
  let sum = 0, wsum = 0;
  for (const [k, w] of DIMS) {
    let v = r[k]?.trim();
    if (k === "production_score" && (v === "0" || v === "0.0" || v === "")) v = ""; // 旧管线该列全 0=未计算，按缺失论
    if (k === "quality_cert_score" && (v === "" )) v = ""; // 空=未知；但 0=无认证（真实信号，保留）
    if (v === "" || v == null) continue;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) continue;
    sum += n * w; wsum += w;
  }
  if (wsum < 0.5) return null; // 可用维度不足一半 → 不给分（L3 薄档案不给假分）
  return Math.round((sum / wsum) * W_ALL * 10 + 39) / 10; // 归一到满分 90.9+3.9 口径
}
function tierOf(score: number | null): string {
  if (score == null) return "培育";
  if (score >= 80) return "金标";
  if (score >= 73) return "银标";
  if (score >= 68) return "铜标";
  if (score >= 63) return "优选";
  return "培育";
}
// 点评模板：只用真实字段拼装，绝不编造
function reviewOf(r: Record<string, string>): string {
  const parts: string[] = [];
  if (r["是否超级工厂"] === "true") parts.push("1688 超级工厂");
  const y = toNum(r["诚信年限"]); if (y) parts.push(`诚信${Math.round(y)}年`);
  const rp = toNum(r["工厂回头率(%)"]); if (rp) parts.push(`回头率${rp}%`);
  const mb = toInt(r["近1月付款买家数"]); if (mb) parts.push(`近一月${mb}买家付款`);
  const emp = toInt(r["员工人数"]); const area = toInt(r["工厂面积(㎡)"]);
  if (emp && area) parts.push(`员工${emp}人、厂房${area}㎡`);
  else if (emp) parts.push(`员工${emp}人`);
  else if (area) parts.push(`厂房${area}㎡`);
  if (!blank(r["第三方认证"])) parts.push(`通过${r["第三方认证"]}认证`);
  if (!blank(r["OEM模式"])) parts.push(`支持${r["OEM模式"]}`);
  if (!blank(r["生产类型"])) parts.push(r["生产类型"]);
  return parts.length ? parts.join("，") + "。" : "工厂档案补全中。";
}

async function main() {
  const db = getDb();
  const raw = readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const cells = parseCsvLine(l);
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = cells[i] ?? ""));
    return o;
  });
  console.log(`CSV 行数 ${rows.length}`);

  const [cur] = (await db.execute(sql`SELECT id, name, member_id FROM factories`)) as any;
  const byMid = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const r of cur as any[]) {
    byMid.set(String(r.member_id), r.id);
    const nn = normName(String(r.name ?? ""));
    if (nn) byName.set(nn, r.id);
  }

  const stats = { midHit: 0, nameHitSkip: 0, emptyNameSkip: 0, insert: 0, trader: 0, scored: 0, catted: 0, geoHit: 0, fillUpdated: 0 };
  const skipNames: string[] = [];
  const geoMiss = new Map<string, number>();

  for (const r of rows) {
    const mid = r["会员ID"].trim();
    const name = r["工厂名称"].trim();
    const nname = normName(name);
    // A) member_id 已存在 → 只填空值
    if (byMid.has(mid)) {
      stats.midHit++;
      if (EXECUTE) {
        const fid = byMid.get(mid)!;
        const sets: string[] = [];
        const fill = (col: string, val: string | number | null, isStr = true) => {
          if (val == null || (isStr && String(val).trim() === "")) return;
          sets.push(`${col} = COALESCE(NULLIF(CAST(${col} AS CHAR), ''), ${isStr ? `'${String(val).replace(/'/g, "''")}'` : val})`);
        };
        fill("cert", r["第三方认证"]); fill("cert_note", r["资质证书"]);
        const emp = toInt(r["员工人数"]); if (emp) sets.push(`employee_count = COALESCE(employee_count, ${emp})`);
        const area = toInt(r["工厂面积(㎡)"]); if (area) sets.push(`area_sqm = COALESCE(area_sqm, ${area})`);
        const rp = toNum(r["工厂回头率(%)"]); if (rp != null) sets.push(`repurchase_rate = COALESCE(repurchase_rate, ${rp})`);
        const rr = toNum(r["旺旺30天回复率(%)"]); if (rr != null) sets.push(`reply_rate = COALESCE(reply_rate, ${rr})`);
        const mb = toInt(r["近1月付款买家数"]); if (mb) sets.push(`monthly_buyers = COALESCE(monthly_buyers, ${mb})`);
        const yy = toNum(r["诚信年限"]); if (yy) sets.push(`years = COALESCE(years, ${yy})`);
        fill("oem_mode", r["OEM模式"]); fill("production_type", r["生产类型"]); fill("service_capability", r["服务能力"]);
        if (r["是否超级工厂"] === "true") sets.push(`is_super = 1`);
        if (sets.length) {
          await db.execute(sql.raw(`UPDATE factories SET ${sets.join(", ")} WHERE id = ${fid}`));
          stats.fillUpdated++;
        }
      }
      continue;
    }
    // B) 空名跳过
    if (!nname) { stats.emptyNameSkip++; continue; }
    // C) 同名不同会员ID = 同公司多店 → 跳过（由 dup 扫描逻辑统一治理）
    if (byName.has(nname)) { stats.nameHitSkip++; skipNames.push(name); continue; }
    // D) 净新增
    const isTrader = TRADER_WORDS.some((w) => name.includes(w)) ? 1 : 0;
    if (isTrader) stats.trader++;
    const score = composite(r);
    if (score != null) stats.scored++;
    const tier = tierOf(score);
    const loc = r["所在地"].trim() || null;
    let prov: string | null = null, city: string | null = null, dist: string | null = null;
    const g = GEO[loc ?? ""] ?? GEO[`${loc}市`] ?? null;
    if (loc && g) { [prov, city, dist] = g; stats.geoHit++; }
    else if (loc) geoMiss.set(loc, (geoMiss.get(loc) ?? 0) + 1);
    const cat = CAT_MAP[r["品类"].trim()] ?? null;
    if (cat) stats.catted++;
    if (!EXECUTE) { stats.insert++; continue; }

    const esc = (v: string | null) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
    const tags = JSON.stringify([r["批次"], r["data_tier"], r["品类"]].filter((x) => x && x.trim()));
    const ins = await db.execute(sql.raw(
      `INSERT INTO factories (member_id, name, location, province, city, district, years, score, tier,
        is_super, cert, cert_note, employee_count, area_sqm, reply_rate, repurchase_rate, monthly_buyers,
        oem_mode, production_type, service_capability, product_count, review, tags, is_trader)
       VALUES (${esc(mid)}, ${esc(name)}, ${esc(loc)}, ${esc(prov)}, ${esc(city)}, ${esc(dist)},
        ${toNum(r["诚信年限"]) ?? "NULL"}, ${score ?? "NULL"}, ${esc(tier)},
        ${r["是否超级工厂"] === "true" ? 1 : 0}, ${esc(r["第三方认证"].trim() || null)}, ${esc(r["资质证书"].trim() || null)},
        ${toInt(r["员工人数"]) ?? "NULL"}, ${toInt(r["工厂面积(㎡)"]) ?? "NULL"}, ${toNum(r["旺旺30天回复率(%)"]) ?? "NULL"},
        ${toNum(r["工厂回头率(%)"]) ?? "NULL"}, ${toInt(r["近1月付款买家数"]) ?? "NULL"},
        ${esc(r["OEM模式"].trim() || null)}, ${esc(r["生产类型"].trim() || null)}, ${esc(r["服务能力"].trim() || null)},
        0, ${esc(reviewOf(r))}, ${esc(tags)}, ${isTrader})`
    )) as any;
    const fid = Number(ins[0]?.insertId ?? 0);
    stats.insert++;
    // 子分（缺失即 NULL；production 全 0 按缺失论）
    const sub = (k: string) => { const v = r[k]?.trim(); if (!v) return "NULL"; if (k === "production_score" && (v === "0" || v === "0.0")) return "NULL"; const n = parseFloat(v); return Number.isFinite(n) ? n : "NULL"; };
    const conf = r["data_tier"] === "L1_verified" ? "high" : r["data_tier"] === "L2_profiled" ? "medium" : "low";
    if (fid) await db.execute(sql.raw(
      `INSERT INTO factory_scores (factory_id, quality_cert, factory_power, trust_years, repurchase, production, service, sales, composite, confidence)
       VALUES (${fid}, ${sub("quality_cert_score")}, ${sub("factory_power_score")}, ${sub("trust_years_score")}, ${sub("repurchase_score")}, ${sub("production_score")}, ${sub("service_score")}, ${sub("sales_score")}, ${score ?? "NULL"}, '${conf}')`
    ));
    if (fid && cat) await db.execute(sql.raw(
      `INSERT INTO factory_categories (factory_id, category, source) VALUES (${fid}, '${cat}', 'legacy_v1')`
    ));
  }

  console.log(JSON.stringify(stats));
  if (skipNames.length) console.log("同名跳过样例:", skipNames.slice(0, 5).join(" | "));
  const gm = [...geoMiss.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (gm.length) console.log("地区未命中映射 TOP12:", JSON.stringify(gm));
  console.log(EXECUTE ? "═══ 已执行落库 ═══" : "═══ DRY-RUN（未写库，加 --execute 才落） ═══");
  process.exit(0);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
main();
