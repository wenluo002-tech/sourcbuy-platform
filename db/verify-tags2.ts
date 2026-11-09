process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const [rows]: any = await db.execute(sql`SELECT id, name, tags FROM factories WHERE id IN (3,5,22) ORDER BY id`);
for (const r of rows) console.log(r.id, r.name, '|', JSON.stringify(r.tags));
// 全库普查：tags 里含「头部严选」的厂家数应恢复到大数
const [c]: any = await db.execute(sql`SELECT COUNT(*) n FROM factories WHERE JSON_CONTAINS(tags, '"头部严选"')`);
console.log('含「头部严选」标签厂家数:', c[0].n);
process.exit(0);
