/** 工商档案版兜底端到端自测：两家罗总验收厂直接跑 runPipeline（ops 白名单免扣分，跑完读快照验证，最后清理） */
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { runPipeline } from "../api/queries/verification";

interface Snap { meta: { companyName: string; uscc?: string | null }; conclusion: { pending: number; uncovered: number; summary: string }; matrix: { item: string; status: string; detail: string }[]; facts: Record<string, unknown>; sources: { category: string }[] }

async function main() {
  const db = getDb();
  const ids: number[] = [];
  for (const name of ["湖南腾圣铝业有限公司", "中山莱博顿卫浴有限公司"]) {
    // 直接造 generating 单（绕过积分扣减，测管线本体）
    const [r] = (await db.execute(dsql`INSERT INTO verification_reports (report_no, user_id, company_name, status, locale, created_at)
      VALUES (CONCAT('TEST-', UNIX_TIMESTAMP(), '-', FLOOR(RAND()*1000)), 600001, ${name}, 'generating', 'zh', NOW())`)) as unknown as [{ insertId: number }];
    const rid = Number(r.insertId);
    ids.push(rid);
    await runPipeline(rid);
    const [rows] = (await db.execute(dsql`SELECT status, error, report, cost_credits FROM verification_reports WHERE id = ${rid}`)) as unknown as [[{ status: string; error: string | null; report: string | null; cost_credits: number }]];
    const row = rows[0];
    console.log(`\n=== ${name} → status=${row.status} err=${row.error ?? "无"} txgc成本=${row.cost_credits}`);
    if (row.status === "ready" && row.report) {
      const s = (typeof row.report === "string" ? JSON.parse(row.report) : row.report) as Snap;
      console.log("公司名:", s.meta.companyName, "| 信用代码:", s.meta.uscc ?? "无");
      console.log("结论:", s.conclusion.summary.slice(0, 120));
      console.log("矩阵 verified 项:");
      for (const m of s.matrix.filter((m) => m.status === "verified")) console.log(`  ✓ ${m.item}: ${m.detail.slice(0, 70)}`);
      console.log("矩阵 pending 项:", s.matrix.filter((m) => m.status === "pending").map((m) => m.item).join("、"));
      console.log("来源:", s.sources.map((x) => x.category).join(" | "));
    }
  }
  // 清理测试单
  for (const id of ids) await db.execute(dsql`DELETE FROM verification_reports WHERE id = ${id}`);
  console.log("\n[自清场] 测试单已删:", ids.join(","));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
