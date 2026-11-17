// ═══ 天下工厂 P1 实证试点（2026-11-17）：三个零覆盖品类拉候选 + 抽样验数据质量 ═══
// 用法：npx tsx db/txgc-pilot.ts [--deep]（--deep 才跑 detail×5 + deepdive×2 质量抽样）
// 预算：3×search(400) + 5×detail(200) + 2×deepdive(500) = 3,200 credits ≈ ¥1.6
// 产出：/mnt/agents/output/ops/txgc-pilot-{date}.json + 控制台摘要
process.loadEnvFile();
import { txgcSearch, txgcDetail, txgcDeepdive, type TxgcFactoryBrief } from "../api/lib/txgc";
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import * as fs from "fs";

const KEYWORDS = ["跑步机", "按摩椅", "电动自行车"];
const DEEP = process.argv.includes("--deep");

function fmt(f: TxgcFactoryBrief) {
  const flags = [
    f.is_foreign_trade ? "外贸" : "",
    f.is_specialized ? "专精特新" : "",
    f.is_high_tech ? "高新" : "",
    f.is_single_champion ? "单项冠军" : "",
  ].filter(Boolean).join("/");
  return `  #${f.id} ${f.name}｜${f.province ?? ""}${f.city ?? ""}｜${f.establish_date ?? "?"}｜注册资本 ${f.registered_capital ?? "?"}｜${flags || "无标签"}｜电话${f.phones_count ?? 0}｜主营: ${(f.main_products ?? []).slice(0, 4).join("、")}`;
}

async function main() {
  const out: any = { date: new Date().toISOString(), keywords: {} as any };
  const db = getDb();

  for (const kw of KEYWORDS) {
    console.log(`\n═══ factory_search「${kw}」(intent=purchase, per_page=50) ═══`);
    const r = await txgcSearch(kw, { per_page: 50 });
    if (r.code !== 0) { console.log(`  ✗ code=${r.code} ${r.message}`); out.keywords[kw] = { error: r.code }; continue; }
    const d = r.data!;
    console.log(`  命中 total=${d.total}，本页 ${d.items.length} 家，扣费 ${r.credits_charged} credits，余额 ${r.credits_balance}`);
    // 交叉核对：这些厂有多少已在我们库里（按企业全称匹配）
    let overlap = 0;
    for (const f of d.items) {
      const hit: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE name = ${f.name}`);
      if (Number((hit[0] as any[])[0]?.c) > 0) { overlap++; (f as any)._in_our_db = true; }
    }
    console.log(`  与我方严选库重叠：${overlap}/${d.items.length} 家`);
    d.items.slice(0, 20).forEach((f) => console.log(fmt(f)));
    out.keywords[kw] = { total: d.total, overlap, items: d.items };
  }

  if (DEEP) {
    const kw = "跑步机";
    const items: TxgcFactoryBrief[] = (out.keywords[kw]?.items ?? []).slice(0, 5);
    console.log(`\n═══ 质量抽样：「${kw}」前 5 家 detail ═══`);
    const details: any[] = [];
    for (const f of items) {
      const r = await txgcDetail(f.id);
      if (r.code !== 0) { console.log(`  ✗ #${f.id} code=${r.code}`); continue; }
      const d = r.data!;
      console.log(`  #${f.id} ${f.name}：经营范围 ${String(d.business_scope ?? "").length} 字｜企业介绍 ${String(d.intro ?? "").length} 字`);
      details.push(d);
    }
    console.log(`\n═══ 质量抽样：前 2 家 deepdive（AI 调研报告）═══`);
    const deepdives: any[] = [];
    for (const f of items.slice(0, 2)) {
      const r = await txgcDeepdive(f.id, f.name, kw);
      if (r.code !== 0) { console.log(`  ✗ #${f.id} code=${r.code} ${r.message}`); continue; }
      const keys = Object.keys(r.data ?? {});
      console.log(`  #${f.id} ${f.name}：返回字段 ${keys.join(", ")}`);
      deepdives.push(r.data);
    }
    out.details = details;
    out.deepdives = deepdives;
  }

  const path = `/mnt/agents/output/ops/txgc-pilot-${new Date().toISOString().slice(0, 10)}.json`;
  fs.mkdirSync("/mnt/agents/output/ops", { recursive: true });
  fs.writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`\n产出：${path}`);
  const spend: any = await db.execute(sql`SELECT COALESCE(SUM(credits_charged),0) s, COUNT(*) n FROM txgc_calls WHERE created_at >= CURDATE()`);
  console.log(`今日台账：${(spend[0] as any[])[0].n} 次调用，共 ${(spend[0] as any[])[0].s} credits ≈ ¥${(Number((spend[0] as any[])[0].s) * 0.0005).toFixed(2)}`);
  process.exit(0);
}
main().catch((e) => { console.error("PILOT FAIL:", e.message); process.exit(1); });
