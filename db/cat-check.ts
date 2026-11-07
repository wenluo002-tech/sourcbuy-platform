/// <reference lib="dom" />
// 一次性核查：前台口径工厂类目分布 + 打标覆盖 + 1688 采集最新进度
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const db = getDb();

const [cat]: any = await db.execute(sql`
  SELECT fc.category, COUNT(DISTINCT fc.factory_id) c
  FROM factory_categories fc
  JOIN factories f ON f.id = fc.factory_id
  WHERE f.is_trader = 0 AND f.dup_of IS NULL
  GROUP BY fc.category ORDER BY c DESC`);
console.log("=== 前台类目分布（独立厂数）===");
for (const r of cat) console.log(`${r.category}\t${r.c}`);

const [t]: any = await db.execute(sql`
  SELECT COUNT(*) total FROM factories WHERE is_trader=0 AND dup_of IS NULL`);
const [tagged]: any = await db.execute(sql`
  SELECT COUNT(DISTINCT fc.factory_id) c FROM factory_categories fc
  JOIN factories f ON f.id=fc.factory_id WHERE f.is_trader=0 AND f.dup_of IS NULL`);
console.log(`\n=== 前台口径 ${t[0].total} 家，已打标 ${tagged[0].c} 家，未打标 ${t[0].total - tagged[0].c} 家 ===`);

const [cards]: any = await db.execute(sql`
  SELECT COUNT(*) checked FROM factories
  WHERE is_trader=0 AND dup_of IS NULL AND cards_checked_at IS NOT NULL`);
const [pend]: any = await db.execute(sql`
  SELECT COUNT(*) p FROM factories
  WHERE is_trader=0 AND dup_of IS NULL AND cards_checked_at IS NULL
    AND (home IS NULL OR home='' OR oem_mode IS NULL OR production_type IS NULL
      OR member_id NOT REGEXP '^b2b-[0-9]' OR years IS NULL OR repurchase_rate IS NULL
      OR seller_user_id IS NULL OR seller_user_id='')`);
console.log(`=== 1688 卡片采集：已查 ${cards[0].checked} 家，剩余待采 ${pend[0].p} 家 ===`);

const [pool]: any = await db.execute(sql`
  SELECT SUBSTRING_INDEX(cat_path,'>',1) l1, COUNT(*) c FROM offer_pool
  WHERE cat_path IS NOT NULL AND cat_path != '' GROUP BY l1 ORDER BY c DESC`);
console.log("\n=== 商品池 L1 类目 ===");
for (const r of pool) console.log(`${r.l1}\t${r.c}`);

process.exit(0);
