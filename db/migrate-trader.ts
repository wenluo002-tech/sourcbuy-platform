// 贸易商标记迁移：加列 + 按名头标记（幂等）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  try {
    await db.execute(sql`ALTER TABLE factories ADD COLUMN is_trader TINYINT(1) NOT NULL DEFAULT 0`);
    console.log("is_trader 列已添加");
  } catch (e: any) {
    if (String(e?.message).includes("Duplicate column")) console.log("is_trader 列已存在，跳过");
    else throw e;
  }
  const w = ["贸易","供应链","商贸","商行","电子商务","跨境电商","进出口","外贸"];
  const cond = w.map(x => `name LIKE '%${x}%'`).join(" OR ");
  const [r]: any = await db.execute(sql.raw(`UPDATE factories SET is_trader = 1 WHERE ${cond}`));
  console.log("标记贸易商:", r.affectedRows ?? r[0]?.affectedRows, "家");
  const [c]: any = await db.execute(sql`SELECT COUNT(*) AS c FROM factories WHERE is_trader = 1`);
  console.log("库内贸易商总数:", c[0].c);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
