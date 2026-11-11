import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const r: any = await db.execute(sql`SELECT id, title FROM radar_items WHERE title LIKE '%nail%' OR title LIKE '%甲%' LIMIT 5`);
for (const row of r?.[0] ?? r ?? []) console.log(row.id, String(row.title).slice(0, 60));
process.exit(0);
