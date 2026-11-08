// 迁移：factories 加 near90d_sales 列（卡片原生「近90天销量」原样字符串）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const db: any = getDb();
const [cols]: any = await db.execute(sql`SHOW COLUMNS FROM factories`);
const have = new Set(cols.map((c: any) => c.Field));
if (!have.has("near90d_sales")) {
  await db.execute(sql`ALTER TABLE factories ADD COLUMN near90d_sales varchar(32) NULL AFTER monthly_buyers`);
  console.log("已加列 near90d_sales");
} else {
  console.log("near90d_sales 已存在，跳过");
}
process.exit(0);
