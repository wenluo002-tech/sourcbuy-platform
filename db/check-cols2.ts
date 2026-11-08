import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const [r]: any = await db.execute(sql`SHOW COLUMNS FROM factories`);
console.log((r as any[]).map((c: any) => c.Field).join(", "));
process.exit(0);
