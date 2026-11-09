process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const [c]: any = await db.execute(sql`SELECT COUNT(*) n FROM factories WHERE JSON_CONTAINS(tags, '"头部严选"')`);
const [c2]: any = await db.execute(sql`SELECT COUNT(*) n FROM factories WHERE JSON_CONTAINS(tags, '"资深老厂"')`);
console.log('含「头部严选」:', c[0].n, ' 含「资深老厂」:', c2[0].n);
process.exit(0);
