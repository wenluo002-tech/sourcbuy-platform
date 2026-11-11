import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
process.loadEnvFile();
const db = getDb();
const [r]: any = await db.execute(dsql`SHOW CREATE TABLE analytics_events`);
console.log(r[0]["Create Table"]);
process.exit(0);
