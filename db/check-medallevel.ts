import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
const d = getDb();
const r = await d.execute(sql`SELECT medal, medal_level, COUNT(*) c FROM factories WHERE medal IS NOT NULL AND medal != '' GROUP BY medal, medal_level ORDER BY medal`);
for (const row of (r as any)[0]) console.log(JSON.stringify(row));
process.exit(0);
