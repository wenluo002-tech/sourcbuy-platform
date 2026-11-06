process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { writeFileSync } from "fs";
async function main() {
  const db = getDb();
  const [rows] = await db.execute(sql`SELECT id, name, member_id, score, tier, is_trader, dup_of FROM factories`) as any;
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["id,name,member_id,score,tier,is_trader,dup_of", ...(rows as any[]).map(r => [r.id, esc(r.name), esc(r.member_id), r.score, esc(r.tier), r.is_trader, r.dup_of ?? ""].join(","))].join("\n");
  writeFileSync("/tmp/current_factories.csv", csv);
  console.log("导出", (rows as any[]).length, "行");
  process.exit(0);
}
main();
