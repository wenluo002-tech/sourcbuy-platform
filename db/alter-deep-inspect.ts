process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const [c]: any = await db.execute(sql`SHOW COLUMNS FROM factories LIKE 'deep_inspected'`);
if (!c.length) {
  await db.execute(sql`ALTER TABLE factories ADD COLUMN deep_inspected TINYINT NULL DEFAULT NULL COMMENT '深度验厂(1688卡片徽章,1=有)'`);
  console.log("ADDED deep_inspected");
} else console.log("EXISTS");
process.exit(0);
