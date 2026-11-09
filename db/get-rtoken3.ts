process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const [r]: any = await db.execute(sql`SELECT upload_token FROM inspection_reports WHERE id=3`);
console.log(r[0].upload_token);
process.exit(0);
