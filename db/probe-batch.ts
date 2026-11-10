import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "fs";
async function main() {
  const db = getDb();
  const [rows]: any = await db.execute(sql`SELECT id FROM factories WHERE cards_checked_at IS NOT NULL`);
  const ids = rows.map((r: any) => r.id).sort((a: number, b: number) => a - b);
  console.log("cards_checked_at 非空总数:", ids.length);
  console.log("id 范围:", ids[0], "–", ids[ids.length - 1]);
  // 分段统计
  const segs: Record<string, number> = {};
  for (const id of ids) {
    const seg = `${Math.floor((id - 1) / 100) * 100 + 1}-${Math.floor((id - 1) / 100) * 100 + 100}`;
    segs[seg] = (segs[seg] ?? 0) + 1;
  }
  console.log("分段分布:", segs);
  fs.writeFileSync("/tmp/ingested_ids.json", JSON.stringify(ids));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
