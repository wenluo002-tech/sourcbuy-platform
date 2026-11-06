process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  // 品牌旗舰店/专营店/专卖店 = 品牌零售店，非源头厂 → 同贸易商口径隔离（经营部是个体户先不动）
  const [rows] = await db.execute(sql`
    SELECT id, name FROM factories WHERE is_trader=0 AND
    (name LIKE '%旗舰店%' OR name LIKE '%专营店%' OR name LIKE '%专卖店%')`) as any;
  for (const r of rows as any[]) console.log("标记:", JSON.stringify(r));
  await db.execute(sql`
    UPDATE factories SET is_trader=1 WHERE is_trader=0 AND
    (name LIKE '%旗舰店%' OR name LIKE '%专营店%' OR name LIKE '%专卖店%')`);
  const [chk] = await db.execute(sql`
    SELECT COUNT(*) c FROM factories WHERE is_trader=0 AND
    (name LIKE '%旗舰店%' OR name LIKE '%专营店%' OR name LIKE '%专卖店%')`) as any;
  console.log("残留:", (chk as any[])[0].c);
  process.exit(0);
}
main();
