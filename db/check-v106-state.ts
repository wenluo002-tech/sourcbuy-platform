import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const [rows] = (await db.execute(sql`SELECT id, request_no, keyword, status, fail_reason, created_at FROM sourcing_requests ORDER BY id DESC LIMIT 5`)) as unknown as [any[]];
  console.log("最近探源单:");
  for (const r of rows) console.log(`  #${r.id} ${r.request_no} "${r.keyword}" status=${r.status} fail=${r.fail_reason ?? "-"} ${r.created_at}`);
  const [ev] = (await db.execute(sql`SELECT sourcing_request_id, stage, count, created_at FROM sourcing_events ORDER BY id DESC LIMIT 5`)) as unknown as [any[]];
  console.log("最近事件:");
  for (const e of ev) console.log(`  sr#${e.sourcing_request_id} ${e.stage} count=${e.count ?? "-"} ${e.created_at}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
