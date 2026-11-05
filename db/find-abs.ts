import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const [rows]: any = await db.execute(sql`SELECT id, name FROM factories WHERE name LIKE '%美看%' LIMIT 2`);
rows.forEach((r: any) => console.log(r.id, r.name));
process.exit(0);
