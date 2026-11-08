// 今日万邦花费核查（验证 tempCheck 熔断是否为真实状态）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const db: any = getDb();
const [rows]: any = await db.execute(
  sql`SELECT COALESCE(SUM(cost_cny),0) s, COUNT(*) n FROM sourcing_api_logs WHERE provider='wanbang' AND DATE(created_at)=CURDATE()`,
);
console.log("today:", JSON.stringify(rows));
const [recent]: any = await db.execute(
  sql`SELECT endpoint, cost_cny, ok, created_at FROM sourcing_api_logs WHERE provider='wanbang' ORDER BY id DESC LIMIT 5`,
);
for (const r of recent) console.log(JSON.stringify(r));
process.exit(0);
