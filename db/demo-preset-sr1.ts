/** Demo 预置（罗总 2026-11-18 拍板：周五 Demo 要看交付页仪式感）：
 *  脐钉单 SB-SR-20261116-001（id=1）用 2 家真实候选驱动到 delivered。
 *  诚实纪律：operator_id 一律 NULL——未做人工深验，交付页温度提示语按「初筛档」显示，不装人工档。 */
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { transition } from "../api/lib/sourcingRequest";

const SR_ID = 1;
async function main() {
  const db = getDb();
  const [rows] = (await db.execute(dsql`SELECT status FROM sourcing_requests WHERE id = ${SR_ID}`)) as unknown as [[{ status?: string }?]];
  const cur = rows?.[0]?.status;
  if (cur !== "scanned") { console.log(`当前 status=${cur}，非 scanned，跳过（幂等）`); process.exit(0); }
  // 候选初筛通过 + 入围（2 家真实候选：青岛华贵承 is_foreign_trade=1、城阳区卓光辉）
  await db.execute(dsql`UPDATE gap_candidates SET screening='pass', screening_reason='人工初筛通过（演示预置）', shortlisted=1, shortlisted_at=NOW() WHERE sourcing_request_id = ${SR_ID}`);
  await transition(SR_ID, "screened", { count: 2, reason: "粗筛：2 家候选入池（演示预置走通主链）" });
  await transition(SR_ID, "verifying", { reason: "核验排队→演示直通（未做人工深验，operator_id 保持空）" });
  await transition(SR_ID, "shortlisted", { count: 2, reason: "入围 2 家" });
  await transition(SR_ID, "delivered", { reason: "交付入围名单" });
  console.log("脐钉单已驱动至 delivered（初筛档文案）");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
