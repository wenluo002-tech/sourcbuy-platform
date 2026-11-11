import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
process.loadEnvFile();
const db = getDb();
const r: any = await db.execute(dsql`DELETE FROM analytics_events WHERE anon_id = 'm5-selftest'`);
console.log("删 m5-selftest 事件:", r[0]?.affectedRows);
const [c]: any = await db.execute(dsql`SELECT COUNT(*) n FROM analytics_events`);
console.log("剩余事件:", c[0].n);
process.exit(0);
