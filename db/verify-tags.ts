process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const [rows]: any = await db.execute(sql`SELECT id, name, tags FROM factories WHERE id IN (3,5,11,22,24)`);
for (const r of rows) console.log(r.id, r.name, '|', r.tags);
process.exit(0);
