import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
process.loadEnvFile();
const db = getDb();
const [t]: any = await db.execute(dsql`SHOW TABLES LIKE 'analytics_events'`);
console.log("analytics_events:", t.length ? "OK" : "MISSING");
for (const [tbl, col] of [["users","role"],["users","attr"],["orders","accepted_at"],["orders","gmv_usd"],["orders","attr"]]) {
  const [c]: any = await db.execute(dsql.raw(`SHOW COLUMNS FROM ${tbl} LIKE '${col}'`));
  console.log(`${tbl}.${col}:`, c.length ? "OK" : "MISSING");
}
const [ir]: any = await db.execute(dsql`SHOW COLUMNS FROM inspection_reports LIKE 'verdict'`);
console.log("inspection_reports.verdict:", ir.length ? "OK" : "MISSING");
const [f]: any = await db.execute(dsql`SHOW COLUMNS FROM factories LIKE 'tags'`);
console.log("factories.tags:", f.length ? "OK" : "MISSING");
process.exit(0);
