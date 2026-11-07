process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const [r]: any = await db.execute(sql`
  SELECT source, COUNT(*) rows_n, COUNT(DISTINCT category) cats, COUNT(DISTINCT factory_id) factories
  FROM factory_categories GROUP BY source ORDER BY rows_n DESC`);
console.log("source\trows\tdistinct_cats\tdistinct_factories");
for (const x of r) console.log(`${x.source}\t${x.rows_n}\t${x.cats}\t${x.factories}`);
const [c]: any = await db.execute(sql`SELECT DISTINCT category FROM factory_categories ORDER BY category`);
console.log("\n全部 distinct category 值:", c.map((x: any) => x.category).join(" / "));
process.exit(0);
