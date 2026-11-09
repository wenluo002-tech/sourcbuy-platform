process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const [rows]: any = await db.execute(sql`SELECT id, order_no, user_id, status, product_title FROM orders WHERE id IN (300003) OR status IN ('goods_ready','in_warehouse','producing','sourcing') ORDER BY id DESC LIMIT 10`);
console.log(JSON.stringify(rows, null, 1));
process.exit(0);
