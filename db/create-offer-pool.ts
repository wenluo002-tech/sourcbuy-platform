// 一次性建表：offer_pool 产品池（v48）
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS offer_pool (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      offer_id VARCHAR(32) NOT NULL,
      title VARCHAR(512) NOT NULL,
      image TEXT,
      price DECIMAL(10,2),
      promotion_price DECIMAL(10,2),
      sales INT NOT NULL DEFAULT 0,
      member_id VARCHAR(64),
      detail_fetched_at TIMESTAMP NULL,
      hit_count INT NOT NULL DEFAULT 1,
      first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_pool_offer (offer_id),
      KEY ix_pool_sales (sales),
      KEY ix_pool_member (member_id),
      KEY ix_pool_lastseen (last_seen_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("offer_pool created");

  // 把现有搜索缓存的 3280 条一次性灌进产品池（零 API 成本）
  const [rows]: any = await db.execute(sql`SELECT items FROM offer_search_cache WHERE items IS NOT NULL`);
  let seen = 0;
  let kept = 0;
  for (const r of rows as any[]) {
    const items = (typeof r.items === "string" ? JSON.parse(r.items) : r.items) as any[];
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      seen++;
      const price = Number(it.promotionPrice ?? it.price ?? 0);
      const sales = Number(it.sales ?? 0);
      // 入池过滤：无销量/无价格/价格离谱（运费链接、占位价）的不要
      if (!it.offerId || !it.title || sales <= 0 || !(price > 0.01 && price < 50000)) continue;
      await db.execute(sql`
        INSERT INTO offer_pool (offer_id, title, image, price, promotion_price, sales, hit_count)
        VALUES (${String(it.offerId)}, ${String(it.title).slice(0, 500)}, ${it.image ?? null},
                ${Number(it.price ?? 0)}, ${it.promotionPrice != null ? Number(it.promotionPrice) : null}, ${sales}, 1)
        ON DUPLICATE KEY UPDATE
          sales = GREATEST(sales, VALUES(sales)),
          hit_count = hit_count + 1,
          last_seen_at = CURRENT_TIMESTAMP
      `);
      kept++;
    }
  }
  const [cnt]: any = await db.execute(sql`SELECT COUNT(*) AS c FROM offer_pool`);
  console.log(`scanned=${seen} kept=${kept} poolRows=${cnt[0].c}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
