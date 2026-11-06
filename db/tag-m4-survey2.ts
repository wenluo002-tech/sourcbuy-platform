process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  // 未打标厂 member_id 形态
  const [fmt] = await db.execute(sql`
    SELECT
      SUM(CASE WHEN f.member_id LIKE 'b2b-%' THEN 1 ELSE 0 END) AS b2b,
      SUM(CASE WHEN f.member_id IS NULL OR f.member_id = '' THEN 1 ELSE 0 END) AS empty,
      SUM(CASE WHEN f.member_id NOT LIKE 'b2b-%' AND f.member_id IS NOT NULL AND f.member_id != '' THEN 1 ELSE 0 END) AS login
    FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)`) as any;
  console.log("未打标厂 member_id 形态:", JSON.stringify(fmt[0]));
  // offer_pool 里 member_id 形态抽样
  const [pf] = await db.execute(sql`SELECT member_id, seller_login_id, seller_user_id FROM offer_pool LIMIT 5`) as any;
  console.log("pool 样例:", JSON.stringify(pf));
  // 已打标厂与池的交集（验证 join 逻辑本身可用）
  const [hit] = await db.execute(sql`
    SELECT COUNT(DISTINCT f.id) AS c FROM factories f
    WHERE EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)
      AND EXISTS (
        SELECT 1 FROM offer_pool p
        WHERE p.member_id = f.member_id
           OR p.seller_login_id = f.member_id
           OR (f.seller_user_id IS NOT NULL AND p.seller_user_id = f.seller_user_id)
      )`) as any;
  console.log("已打标厂中产品池有货的（验证 join）:", hit[0].c);
  // 用 seller_user_id 从 member_id 提取再 join
  const [hit2] = await db.execute(sql`
    SELECT COUNT(DISTINCT f.id) AS c FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)
      AND f.member_id LIKE 'b2b-%'
      AND EXISTS (
        SELECT 1 FROM offer_pool p
        WHERE p.seller_user_id IS NOT NULL
          AND p.seller_user_id = SUBSTRING_INDEX(SUBSTRING(f.member_id, 5), '-', 1)
      )`) as any;
  console.log("未打标厂 b2b- 提取 userId 后与池交集:", hit2[0].c);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
