/** 入库前侦察2：各目标字段的存量值格式样本（决定解析口径） */
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const cols = ["repurchase_rate", "oem_mode", "production_type", "employee_count", "near90d_sales", "monthly_buyers", "cert", "deep_inspected", "is_super", "area_sqm", "years"];
  for (const c of cols) {
    const [rows] = (await db.execute(
      dsql.raw(`SELECT ${c} AS v, COUNT(*) AS n FROM factories WHERE ${c} IS NOT NULL AND ${c} != '' GROUP BY ${c} ORDER BY n DESC LIMIT 5`),
    )) as unknown as [Array<{ v: unknown; n: number | string }>];
    console.log(`${c}:`, rows.map((r) => `${JSON.stringify(r.v)}×${r.n}`).join("  "));
  }
  // 已入库行的 cards_checked_at 与 jsonl ts 的关系抽查（id=3 是 jsonl 第一行）
  const [r3] = (await db.execute(dsql`SELECT id, years, repurchase_rate, area_sqm, deep_inspected, cards_checked_at FROM factories WHERE id IN (3,5,11,13,14)`)) as unknown as [unknown[]];
  console.log("已采样本行:", JSON.stringify(r3, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
