/**
 * 1688 工厂卡片「最终版」入库（2026-11-18，数据管线分身）
 * 来源：/mnt/agents/upload/结果_全量2358家_最终版_20261118-1137.jsonl（Mac 采集器，matched=true 2227 家）
 * 铁律：只填 NULL/空值，绝不覆盖真实数据；评分列（score/tier/medal）绝不写；cert 不碰
 *   （jsonl 的 cert 是 1688「深度验厂」话术非认证名，只折算进 deep_inspected）
 * 幂等：重跑同结果（值固定来自文件；COALESCE 填满后自然零写入）
 * 用法：npx tsx db/import-factory-cards-final.ts          # dry-run 只统计
 *       npx tsx db/import-factory-cards-final.ts --execute # 实写
 */
process.loadEnvFile();
import { readFileSync } from "fs";
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";

const FILE = "/mnt/agents/upload/结果_全量2358家_最终版_20261118-1137.jsonl";
const EXECUTE = process.argv.includes("--execute");

interface CardRow {
  id: number; name: string; matched: boolean; ts: string;
  card?: {
    years?: number | null; repurchase?: number | null; ptype?: string | null;
    oem?: string[] | null; areaSqm?: number | null; deepInspected?: boolean;
    isSuper?: boolean; info?: { 员工人数?: string; 近90天销量?: string };
  };
}

/** "51-100人"→51；"1000人以上"→1000；"5人"→5（口径同 shopEnrich：区间取下限） */
function parseEmployees(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

async function main() {
  const db = getDb();
  const lines = readFileSync(FILE, "utf8").trim().split("\n");
  let matched = 0, unmatched = 0, noRow = 0;
  const fill: Record<string, number> = {};
  let updated = 0;

  for (const line of lines) {
    const r = JSON.parse(line) as CardRow;
    const c = r.card;
    if (!r.matched || !c) {
      unmatched++;
      if (EXECUTE) {
        // 未匹配=已检查过（防下次重采浪费请求），只标时间戳
        await db.execute(dsql`UPDATE factories SET cards_checked_at = ${r.ts.replace("T", " ").slice(0, 19)} WHERE id = ${r.id} AND cards_checked_at IS NULL`).catch(() => {});
      }
      continue;
    }
    matched++;
    const ts = r.ts.replace("T", " ").slice(0, 19);
    const vals: Record<string, string | number | null> = {
      years: c?.years != null ? `${c.years}.0` : null,
      repurchase_rate: c?.repurchase != null ? `${c.repurchase}.0` : null,
      production_type: c?.ptype ?? null,
      oem_mode: c?.oem?.length ? c.oem.join(",") : null,
      area_sqm: c?.areaSqm ?? null,
      deep_inspected: c?.deepInspected ? 1 : null,
      is_super: c?.isSuper != null ? (c.isSuper ? 1 : 0) : null,
      employee_count: parseEmployees(c?.info?.员工人数),
      near90d_sales: c?.info?.近90天销量 ?? null,
    };
    // 只填 NULL/空：COALESCE(旧值, 新值)，旧值有值则新值不落
    // 列名来自上方 vals 固定白名单（安全），值走参数绑定；dsql.raw 不接参数——必须用模板拼接
    // 2026-11-18 复现确认：NULLIF(decimal/int列,'') 触发 ER_TRUNCATED_WRONG_VALUE(1292)——
    //   空串比较只对 varchar 列用；数值列不可能存 ''，纯 COALESCE 即可
    const NUMERIC_COLS = new Set(["years", "repurchase_rate", "area_sqm", "deep_inspected", "is_super", "employee_count"]);
    const setClauses = [];
    for (const [k, v] of Object.entries(vals)) {
      if (v == null) continue;
      setClauses.push(
        NUMERIC_COLS.has(k)
          ? dsql`${dsql.raw(k)} = COALESCE(${dsql.raw(k)}, ${v})`
          : dsql`${dsql.raw(k)} = COALESCE(NULLIF(${dsql.raw(k)}, ''), ${v})`,
      );
    }
    setClauses.push(dsql`cards_checked_at = ${ts}`);
    if (EXECUTE) {
      const [res] = (await db.execute(
        dsql`UPDATE factories SET ${dsql.join(setClauses, dsql`, `)} WHERE id = ${r.id}`,
      ).catch((e) => { console.error(`id=${r.id} 写入失败:`, e instanceof Error ? e.message : e); return [{ affectedRows: 0 }]; })) as [{ affectedRows?: number }];
      if (res?.affectedRows) updated++;
    } else {
      // dry-run：统计各字段会填多少（库内当前为空且新值非空）
      const [rows] = (await db.execute(dsql`SELECT years, repurchase_rate, production_type, oem_mode, area_sqm, deep_inspected, is_super, employee_count, near90d_sales FROM factories WHERE id = ${r.id}`)) as unknown as [Array<Record<string, unknown>>];
      const row = rows[0];
      if (!row) { noRow++; continue; }
      for (const [k, v] of Object.entries(vals)) {
        if (v == null) continue;
        const cur = row[k];
        if (cur == null || cur === "") fill[k] = (fill[k] ?? 0) + 1;
      }
    }
  }

  console.log(`matched=${matched} unmatched=${unmatched}`);
  if (EXECUTE) console.log(`实写完成：${updated} 行有更新`);
  else {
    console.log(`dry-run：库内无此 id ${noRow} 行；各字段预计回填：`);
    for (const [k, n] of Object.entries(fill).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: +${n}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
