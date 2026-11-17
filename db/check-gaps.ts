// 查缺口雷达台账：npx tsx db/check-gaps.ts
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const r: any = await db.execute(sql`SELECT id, keyword, status, txgc_total, candidate_count, error, created_at FROM gap_requests ORDER BY id DESC LIMIT 8`);
  for (const row of r[0] as any[]) console.log(JSON.stringify(row));
  const c: any = await db.execute(sql`SELECT COUNT(*) n FROM gap_candidates`);
  console.log("candidates total:", (c[0] as any[])[0].n);
  process.exit(0);
}
main();
