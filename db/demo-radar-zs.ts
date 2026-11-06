process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [r] = await db.execute(sql`SELECT * FROM radar_items ORDER BY id`) as any;
  console.log("雷达在榜品类:");
  for (const x of r as any[]) console.log(`  #${x.id} ${x.title} (${x.title_en}) [${x.category}]`);
  // 首页统计口径
  const [st] = await db.execute(sql`SELECT COUNT(*) AS c FROM factories WHERE is_trader = 0`) as any;
  console.log("\n前台严选工厂数（排除贸易商）:", st[0].c);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
