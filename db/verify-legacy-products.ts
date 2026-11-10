// legacy_products 全量入库后独立抽查：总数/分层/异常价/join 严选库命中率
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const db = getDb();
const q = async (s: string) => (await db.execute(sql.raw(s))) as any;
const rows = (r: any) => (Array.isArray(r) ? (Array.isArray(r[0]) ? r[0] : r) : []);

console.log("总数:", JSON.stringify(rows(await q(`SELECT COUNT(*) n, COUNT(DISTINCT product_id) u, COUNT(DISTINCT member_id) m FROM legacy_products`))[0]));
console.log("tier 分布:", JSON.stringify(rows(await q(`SELECT tier_legacy, COUNT(*) n FROM legacy_products GROUP BY tier_legacy ORDER BY n DESC`))));
console.log("综合分 top3:", JSON.stringify(rows(await q(`SELECT product_id, LEFT(title,24) t, factory_score, tier_legacy FROM legacy_products ORDER BY factory_score DESC LIMIT 3`))));
console.log("异常价样例:", JSON.stringify(rows(await q(`SELECT product_id, LEFT(title,20) t, price_cny FROM legacy_products WHERE price_suspect=1 LIMIT 3`))));
// join 严选库：member_id 三键口径（memberId/loginId 都在 factories.member_id）
console.log("join 严选库命中:", JSON.stringify(rows(await q(`SELECT COUNT(*) n FROM legacy_products lp WHERE lp.member_id IS NOT NULL AND EXISTS (SELECT 1 FROM factories f WHERE f.member_id = lp.member_id AND f.is_trader=0 AND f.dup_of IS NULL)`))[0]));
console.log("细品类 top8:", JSON.stringify(rows(await q(`SELECT fine_category, COUNT(*) n FROM legacy_products GROUP BY fine_category ORDER BY n DESC LIMIT 8`))));
process.exit(0);
