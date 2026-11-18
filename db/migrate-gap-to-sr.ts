// ═══ 存量迁移：gap_requests(3 行) → sourcing_requests（P0，2026-11-18）═══
// 幂等：以 keyword+created_at 判重，可重跑。迁移后 gap_requests 停写只读（30 天后归档改名，不 truncate）。
// 映射：enriched→scanned（候选已入池）；no_keyword→failed/no_keyword；核查回灌行（request_id=0）不动。
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const rows: any = await db.execute(sql`SELECT * FROM gap_requests ORDER BY id`);
  let migrated = 0, skipped = 0;
  for (const g of rows[0] as any[]) {
    const exist: any = await db.execute(
      sql`SELECT id FROM sourcing_requests WHERE keyword = ${g.keyword} AND created_at = ${g.created_at} LIMIT 1`,
    );
    let srId = Number(exist[0]?.[0]?.id ?? 0);
    if (srId) { skipped++; } else {
      const day = new Date(g.created_at).toISOString().slice(0, 10).replace(/-/g, "");
      const c: any = await db.execute(sql`SELECT COUNT(*) AS n FROM sourcing_requests WHERE request_no LIKE ${"SB-SR-" + day + "-%"}`);
      const no = `SB-SR-${day}-${String(Number(c[0]?.[0]?.n ?? 0) + 1).padStart(3, "0")}`;
      const isFail = g.status === "no_keyword";
      const ins: any = await db.execute(sql`INSERT INTO sourcing_requests
        (request_no, user_id, keyword, locale, status, fail_reason, fail_copy_key, scanned_at, created_at)
        VALUES (${no}, ${g.user_id}, ${g.keyword}, ${g.locale ?? "zh"},
          ${isFail ? "failed" : "scanned"}, ${isFail ? "no_keyword" : null}, ${isFail ? "no_keyword" : null},
          ${isFail ? null : g.enriched_at}, ${g.created_at})`);
      srId = Number(ins[0]?.insertId);
      await db.execute(sql`INSERT INTO sourcing_request_events (request_id, stage, created_at) VALUES (${srId}, 'received', ${g.created_at})`);
      if (isFail) {
        await db.execute(sql`INSERT INTO sourcing_request_events (request_id, stage, reason, created_at) VALUES (${srId}, 'failed', '未提取到明确产品词（存量迁移）', ${g.created_at})`);
      } else {
        await db.execute(sql`INSERT INTO sourcing_request_events (request_id, stage, count, created_at) VALUES (${srId}, 'scanned', ${g.txgc_total ?? null}, ${g.enriched_at ?? g.created_at})`);
      }
      migrated++;
      console.log(`gap#${g.id}「${g.keyword}」→ ${no} (${isFail ? "failed/no_keyword" : "scanned"})`);
    }
    // 候选回填主表外键（request_id 是旧 gap_requests.id）
    await db.execute(sql`UPDATE gap_candidates SET sourcing_request_id = ${srId} WHERE request_id = ${g.id} AND sourcing_request_id IS NULL`);
  }
  console.log(`迁移完成：新增 ${migrated}，跳过（已存在）${skipped}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
