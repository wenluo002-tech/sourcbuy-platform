process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { GEO_DIRTY } from "./geo-map";
async function main() {
  const db = getDb();
  let n = 0;
  for (const w of GEO_DIRTY) {
    const [r] = await db.execute(sql`UPDATE factories SET location=NULL WHERE location=${w}`) as any;
    n += Number((r as any).affectedRows ?? 0);
  }
  console.log("脏值 location 置 NULL:", n);
  const [cov] = await db.execute(sql`SELECT COUNT(*) t, SUM(province IS NOT NULL AND province!='') p, SUM(city IS NOT NULL AND city!='') c FROM factories`) as any;
  console.log("覆盖率:", JSON.stringify((cov as any[])[0]));
  process.exit(0);
}
main();
