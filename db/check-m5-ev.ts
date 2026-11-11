import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
process.loadEnvFile();
const db = getDb();
const [r]: any = await db.execute(dsql`SELECT id, event, anon_id, path, utm_source, referrer, ts FROM analytics_events ORDER BY id DESC LIMIT 3`);
console.log(JSON.stringify(r, null, 1));
process.exit(0);
