process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [del] = await db.execute(sql`
    DELETE fc FROM factory_categories fc JOIN factories f ON f.id = fc.factory_id
    WHERE fc.source = 'pool_v1'
      AND (f.name LIKE '%贸易%' OR f.name LIKE '%供应链%' OR f.name LIKE '%商贸%' OR f.name LIKE '%商行%'
           OR f.name LIKE '%电子商务%' OR f.name LIKE '%进出口%' OR f.name LIKE '%外贸%')`) as any;
  console.log("已撤销贸易商 pool_v1 标签:", del.affectedRows ?? del[0]?.affectedRows, "条");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
