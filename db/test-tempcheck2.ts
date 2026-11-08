// tempCheck 成功路径实测：取严选库一家真实厂名
process.loadEnvFile();
import { tempCheckFactory } from "../api/queries/tempCheck";
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const db: any = getDb();
const [rows]: any = await db.execute(sql`SELECT id, name FROM factories WHERE member_id IS NOT NULL AND years IS NOT NULL ORDER BY id DESC LIMIT 3`);
for (const f of rows) console.log("candidate:", f.id, f.name);
const name = rows[1].name;
console.log("\n=== 实测:", name, "===");
const r = await tempCheckFactory(name, 420005);
console.log(JSON.stringify(r, null, 1).slice(0, 3000));
process.exit(0);
