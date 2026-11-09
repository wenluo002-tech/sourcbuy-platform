process.loadEnvFile();
import { getDb } from "/mnt/agents/output/app/api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
// 1. 本批 id 范围 3-390，抽几家看关键字段
const [spot]: any = await db.execute(sql`
  SELECT id, name, member_id, seller_user_id, near90d_sales, deep_inspected, is_super, cert,
         LEFT(tags, 60) AS tags_head, cards_checked_at
  FROM factories WHERE id IN (3, 372, 371, 376, 23) ORDER BY id`);
console.log("=== 抽查5家（含未匹配#23） ===");
for (const r of spot) console.log(JSON.stringify(r, null, 0));
// 2. cert 净化检查：全库不得有「深度验厂认证」字样
const [certBad]: any = await db.execute(sql`SELECT COUNT(*) n FROM factories WHERE cert LIKE '%深度验厂认证%'`);
console.log("\ncert 含徽章文案残留:", certBad[0].n);
// 3. 本批落库统计：cards_checked_at 今天的
const [stat]: any = await db.execute(sql`
  SELECT COUNT(*) total,
         SUM(deep_inspected=1) deep, SUM(is_super=1) super_badge,
         SUM(near90d_sales IS NOT NULL AND near90d_sales<>'') n90,
         SUM(member_id IS NOT NULL AND member_id<>'') has_mid
  FROM factories WHERE DATE(cards_checked_at)='2026-11-09'`);
console.log("今日已采标记:", JSON.stringify(stat[0]));
// 4. 台账
const [log]: any = await db.execute(sql`SELECT COUNT(*) n, SUM(ok) ok_n FROM sourcing_api_logs WHERE provider='1688web-mac' AND DATE(created_at)='2026-11-09'`);
console.log("今日台账:", JSON.stringify(log[0]));
// 5. 全库总量
const [tot]: any = await db.execute(sql`SELECT COUNT(*) total, SUM(cards_checked_at IS NOT NULL) checked, SUM(deep_inspected=1) deep_all FROM factories`);
console.log("全库:", JSON.stringify(tot[0]));
process.exit(0);
