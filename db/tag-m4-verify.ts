process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  // 户外运动 41 家偏多，抽查
  const [out] = await db.execute(sql`
    SELECT f.name, fc.category FROM factory_categories fc JOIN factories f ON f.id = fc.factory_id
    WHERE fc.source IN ('name_v1','pool_v1') AND fc.category = '户外运动' LIMIT 15`) as any;
  console.log("户外运动新标样本:");
  for (const r of out as any[]) console.log(" ", r.name);
  // 各来源抽 5 家看精度
  const [pool] = await db.execute(sql`
    SELECT f.name, fc.category FROM factory_categories fc JOIN factories f ON f.id = fc.factory_id
    WHERE fc.source = 'pool_v1' LIMIT 10`) as any;
  console.log("\n产品池新标样本:");
  for (const r of pool as any[]) console.log(" ", r.name, "→", r.category);
  // 仍未打标的随机 25 家看漏了什么模式
  const [rest] = await db.execute(sql`
    SELECT f.name FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)
    ORDER BY RAND() LIMIT 25`) as any;
  console.log("\n仍未打标随机样本:");
  for (const r of rest as any[]) console.log(" ", r.name);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
