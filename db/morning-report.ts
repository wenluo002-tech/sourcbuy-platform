// 晨间战报数据汇总：全部数字现查，输出 markdown 片段
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "fs";

async function main() {
  const db = getDb();
  const out: string[] = [];

  const [tier]: any = await db.execute(sql`SELECT tier, COUNT(*) c FROM factories WHERE is_trader=0 AND dup_of IS NULL GROUP BY tier ORDER BY FIELD(tier,'金标','银标','铜标','优选','培育')`);
  const [tot]: any = await db.execute(sql`SELECT COUNT(*) t FROM factories`);
  const [front]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE is_trader=0 AND dup_of IS NULL`);
  out.push(`工厂库：总库 ${(tot[0] as any).t}；前台口径 ${(front[0] as any).c}（剔贸易商与重复）`);
  out.push(`- 分层：` + tier.map((x: any) => `${x.tier} ${x.c}`).join(" / "));

  const [cards]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE cards_checked_at IS NOT NULL`);
  const [gap]: any = await db.execute(sql`
    SELECT SUM(home IS NULL OR home='') no_home, SUM(oem_mode IS NULL) no_oem,
      SUM(production_type IS NULL) no_ptype, SUM(seller_user_id IS NULL OR seller_user_id='') no_uid,
      SUM(member_id NOT REGEXP '^b2b-[0-9]') bad_member
    FROM factories WHERE is_trader=0 AND dup_of IS NULL`);
  out.push(`1688 采集：已处理 ${(cards[0] as any).c} 家；缺口现况 home缺${gap[0].no_home} oem缺${gap[0].no_oem} ptype缺${gap[0].no_ptype} uid缺${gap[0].no_uid} member坏${gap[0].bad_member}`);

  // 命中率与未命中候选
  let hit = 0, miss = 0; const misses: Array<[number, string, string[]]> = [];
  try {
    for (const l of fs.readFileSync("/mnt/agents/output/app/factory-cards-report.jsonl", "utf-8").split("\n")) {
      if (!l.startsWith("{")) continue;
      try {
        const d = JSON.parse(l);
        if (d.matched) hit++; else { miss++; if (misses.length < 30) misses.push([d.id, d.name, d.cands ?? []]); }
      } catch { /* 半行 */ }
    }
  } catch { /* 无报告 */ }
  out.push(`- 命中 ${hit} / 未匹配 ${miss}（命中率 ${hit + miss ? ((hit / (hit + miss)) * 100).toFixed(1) : "-"}%）`);

  const [pool]: any = await db.execute(sql`SELECT COUNT(*) t, SUM(cat_path IS NOT NULL AND cat_path<>'') c, SUM(weight_g IS NOT NULL) w FROM offer_pool`);
  out.push(`商品池：${pool[0].t} 条；三级类目 ${pool[0].c}（${((Number(pool[0].c) / Number(pool[0].t)) * 100).toFixed(1)}%）；SKU 重量 ${pool[0].w}（${((Number(pool[0].w) / Number(pool[0].t)) * 100).toFixed(1)}%）`);

  const [tag]: any = await db.execute(sql`SELECT COUNT(*) c, COUNT(DISTINCT factory_id) f FROM factory_categories WHERE source='wbshop_v1'`);
  const [tagAll]: any = await db.execute(sql`SELECT source, COUNT(*) c FROM factory_categories GROUP BY source`);
  out.push(`类目打标：wbshop_v1 ${tag[0].f} 厂 ${tag[0].c} 行；全量 ` + tagAll.map((x: any) => `${x.source}=${x.c}`).join(" "));

  const [costD]: any = await db.execute(sql`SELECT provider, COUNT(*) n, SUM(cost_cny) c FROM sourcing_api_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) GROUP BY provider`);
  const [costA]: any = await db.execute(sql`SELECT provider, COUNT(*) n, SUM(cost_cny) c FROM sourcing_api_logs GROUP BY provider`);
  out.push(`费用近24h：` + costD.map((x: any) => `${x.provider} ${x.n}次 ¥${Number(x.c).toFixed(2)}`).join("；"));
  out.push(`费用累计：` + costA.map((x: any) => `${x.provider} ${x.n}次 ¥${Number(x.c).toFixed(2)}`).join("；"));

  if (misses.length) {
    out.push(`未匹配样例（供人工核）：`);
    for (const [id, name, cands] of misses.slice(0, 15)) out.push(`- #${id} ${name}${cands.length ? ` ← 候选:${cands.join("/")}` : " ← 无候选"}`);
  }
  console.log(out.join("\n"));
  process.exit(0);
}
main().catch((e) => { console.log(String(e).slice(0, 300)); process.exit(1); });
