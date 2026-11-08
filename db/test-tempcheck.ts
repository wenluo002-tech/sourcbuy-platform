// tempCheck 直连诊断：绕过 HTTP，直接调函数看真实报错
process.loadEnvFile();
import { tempCheckFactory } from "../api/queries/tempCheck";
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const db: any = getDb();
const r = await tempCheckFactory("中山市三乡镇朗日电器厂", 420005);
console.log("RESULT:", JSON.stringify(r, null, 1).slice(0, 2000));
const [logs]: any = await db.execute(
  sql`SELECT endpoint, cost_cny, ok, error, created_at FROM sourcing_api_logs WHERE endpoint='tempCheck' ORDER BY id DESC LIMIT 3`,
);
console.log("LOGS:", JSON.stringify(logs, null, 1));
const [tc]: any = await db.execute(sql`SELECT id, status, score, cost_cny FROM temp_factory_checks ORDER BY id DESC LIMIT 3`);
console.log("TC:", JSON.stringify(tc));
process.exit(0);
