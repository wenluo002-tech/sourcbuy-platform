process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [a] = await db.execute(sql`SELECT id, name, is_trader FROM factories WHERE id = 6`) as any;
  console.log("id=6:", JSON.stringify((a as any[])[0]));
  // 名头含贸易商关键词但没被标记的
  const [b] = await db.execute(sql`
    SELECT id, name, is_trader FROM factories
    WHERE is_trader = 0 AND (
      name LIKE '%贸易%' OR name LIKE '%供应链%' OR name LIKE '%商贸%' OR
      name LIKE '%商行%' OR name LIKE '%电子商务%' OR name LIKE '%跨境电商%' OR
      name LIKE '%进出口%' OR name LIKE '%外贸%'
    ) LIMIT 30`) as any;
  console.log("疑似漏标:", (b as any[]).length);
  for (const r of b as any[]) console.log(JSON.stringify(r));
  process.exit(0);
}
main();
