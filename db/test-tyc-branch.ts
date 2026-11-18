/** 工商档案版兜底分支验证：找 TXGC 真 miss 的厂跑 runPipeline */
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { txgcSearch } from "../api/lib/txgc";
import { runPipeline } from "../api/queries/verification";

interface Snap { conclusion: { summary: string }; matrix: { item: string; status: string; detail: string }[]; registration: { label: string; value: string }[]; sources: { category: string }[]; businessScope?: string | null }

async function main() {
  const db = getDb();
  const candidates = ["广东宏新源科技有限公司", "深圳市新迪泰电子有限公司", "浙江爱度服饰有限公司"];
  let missName: string | null = null;
  for (const kw of candidates) {
    const r = await txgcSearch(kw, { intent: "company_query", per_page: 5 });
    const hit = (r.data?.items ?? []).length > 0;
    console.log(`TXGC「${kw}」${hit ? "命中" : "MISS"}`);
    if (!hit) { missName = kw; break; }
  }
  if (!missName) { console.log("三家都命中，换批再试"); process.exit(0); }

  console.log(`\n=== 用 TXGC-miss 的「${missName}」验证兜底分支 ===`);
  const [r] = (await db.execute(dsql`INSERT INTO verification_reports (report_no, user_id, company_name, status, locale, created_at)
    VALUES (CONCAT('TEST-', UNIX_TIMESTAMP()), 600001, ${missName}, 'generating', 'zh', NOW())`)) as unknown as [{ insertId: number }];
  const rid = Number(r.insertId);
  await runPipeline(rid);
  const [rows] = (await db.execute(dsql`SELECT status, error, report FROM verification_reports WHERE id = ${rid}`)) as unknown as [[{ status: string; error: string | null; report: unknown }]];
  const row = rows[0];
  console.log(`status=${row.status} err=${row.error ?? "无"}`);
  if (row.status === "ready" && row.report) {
    const s = (typeof row.report === "string" ? JSON.parse(row.report) : row.report) as Snap;
    console.log("结论:", s.conclusion.summary.slice(0, 130));
    console.log("verified 项:");
    for (const m of s.matrix.filter((m) => m.status === "verified")) console.log(`  ✓ ${m.item}: ${m.detail.slice(0, 75)}`);
    console.log("pending 项:", s.matrix.filter((m) => m.status === "pending").map((m) => m.item).join("、"));
    console.log("注册段:");
    for (const r2 of s.registration.slice(0, 6)) console.log(`  ${r2.label}: ${String(r2.value).slice(0, 60)}`);
    console.log("经营范围:", (s.businessScope ?? "无")?.slice(0, 80));
    console.log("来源:", s.sources.map((x) => x.category).join(" | "));
  }
  await db.execute(dsql`DELETE FROM verification_reports WHERE id = ${rid}`);
  console.log("\n[自清场] 已删", rid);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
