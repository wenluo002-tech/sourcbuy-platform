process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const w = ["贸易","供应链","商贸","商行","电子商务","跨境电商","进出口","外贸"];
  const cond = w.map(x => `f.name LIKE '%${x}%'`).join(" OR ");
  const [t] = await db.execute(sql.raw(`SELECT COUNT(*) AS c FROM factories f WHERE ${cond}`)) as any;
  const [tagged] = await db.execute(sql.raw(`
    SELECT COUNT(DISTINCT f.id) AS c FROM factories f
    WHERE (${cond}) AND EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)`)) as any;
  console.log("全库贸易商名头:", t[0].c, "家，其中已有类目标签:", tagged[0].c, "家");
  const [s] = await db.execute(sql.raw(`SELECT f.id, f.name, f.score, f.tier FROM factories f WHERE ${cond} ORDER BY f.score DESC LIMIT 10`)) as any;
  for (const r of s as any[]) console.log(" ", r.id, r.name, r.tier, r.score);
  // matchFactories 和 stats 怎么查的
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
