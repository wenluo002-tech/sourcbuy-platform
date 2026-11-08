/**
 * 导出数据库结构（仅 DDL，不含数据）+ 各表行数口径
 * 跑法：cd /mnt/agents/output/app && npx tsx db/dump-schema.ts
 */
import { getDb } from "../api/queries/connection";
import * as fs from "fs";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const [tables]: any = await db.execute(sql`SHOW TABLES`);
  const names = tables.map((r: any) => Object.values(r)[0] as string);
  let ddl = `-- SourcBuy 数据库结构快照（仅结构，不含数据）\n-- 导出时间: ${new Date().toISOString()}\n-- 引擎: MySQL 兼容（TiDB）\n\n`;
  const counts: string[] = [];
  for (const t of names) {
    const [create]: any = await db.execute(sql.raw(`SHOW CREATE TABLE \`${t}\``));
    const row: any = Array.isArray(create) ? create[0] : create;
    const createSql = row["Create Table"] || row["Create Table "] || Object.values(row)[1];
    ddl += `DROP TABLE IF EXISTS \`${t}\`;\n${createSql};\n\n`;
    try {
      const [c]: any = await db.execute(sql.raw(`SELECT COUNT(*) AS n FROM \`${t}\``));
      const n = Array.isArray(c) ? c[0]?.n : 0;
      counts.push(`${t}: ${n}`);
    } catch {
      counts.push(`${t}: (count failed)`);
    }
  }
  fs.writeFileSync("/tmp/schema.sql", ddl);
  fs.writeFileSync("/tmp/table-counts.txt", counts.join("\n") + "\n");
  console.log("tables:", names.length);
  console.log(counts.join("\n"));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
