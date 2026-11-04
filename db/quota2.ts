process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const [r]: any = await db.execute(sql`SELECT endpoint, COUNT(*) c FROM sourcing_api_logs WHERE created_at >= CURDATE() AND provider='wanbang' GROUP BY endpoint`);
const total = r.reduce((s: number, x: any) => s + Number(x.c), 0);
console.log("今日万邦调用：", r, "合计", total, "，剩余", 200 - total);
process.exit(0);
