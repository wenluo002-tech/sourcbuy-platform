import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const r: any = await db.execute(sql`SELECT offer_id, title FROM offer_pool WHERE title LIKE '%穿戴甲%' LIMIT 5`);
for (const row of r?.[0] ?? r ?? []) console.log(row.offer_id, String(row.title).slice(0, 50));
process.exit(0);
