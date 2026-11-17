// P4 报告管线端到端实测：宝翔体育（真实 TXGC 数据，预计花 ≈¥0.55）
// 用法：npx tsx db/test-verification.ts
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { runPipeline } from "../api/queries/verification";

async function main() {
  const db = getDb();
  // 直接建行（绕过积分：积分链路已单测 9/9，这里验管线本身）
  const r: any = await db.execute(dsql`INSERT INTO verification_reports
    (report_no, user_id, company_name, company_key, locale, product_word)
    VALUES ('SB-VR-TEST-001', 999000001, '江苏宝翔体育器材有限公司', '江苏宝翔体育器材有限公司', 'zh', '跑步机')`);
  const id = Number(r[0]?.insertId);
  console.log("report row:", id, "→ 跑管线（deepdive 30-90s，耐心等）…");
  const t0 = Date.now();
  await runPipeline(id);
  const row: any = await db.execute(dsql`SELECT status, error, txgc_id, in_our_system, factory_id, cost_credits, pdf_path, JSON_LENGTH(JSON_EXTRACT(report,'$.matrix')) AS matrix_n, JSON_EXTRACT(report,'$.priceIntel.min') AS pmin, JSON_EXTRACT(report,'$.priceIntel.max') AS pmax FROM verification_reports WHERE id = ${id}`);
  const row0 = row[0]?.[0];
  console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`, row0);
  if (row0?.status !== "ready") { console.error("FAIL status:", row0); process.exit(1); }
  console.log("PASS 管线 ready，PDF:", row0.pdf_path);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
