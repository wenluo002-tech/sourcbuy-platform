// 买侧上下文资产迁移：recommendation_logs + buyer_profiles 两表，orders 加选择理由两列。幂等。
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const db: any = getDb();
await db.execute(sql`CREATE TABLE IF NOT EXISTS recommendation_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  thread_id BIGINT UNSIGNED NULL,
  message VARCHAR(500) NULL,
  intent_product VARCHAR(128) NULL,
  intent_quantity INT NULL,
  intent_destination VARCHAR(64) NULL,
  factories JSON NULL,
  products_count INT NULL,
  had_link TINYINT(1) DEFAULT 0,
  had_image TINYINT(1) DEFAULT 0,
  factory_qa TINYINT(1) DEFAULT 0,
  adopted_offer_id VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_reclog_user (user_id, created_at),
  INDEX ix_reclog_created (created_at)
)`);
await db.execute(sql`CREATE TABLE IF NOT EXISTS buyer_profiles (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  categories JSON NULL,
  destinations JSON NULL,
  quantities JSON NULL,
  sample_size INT NOT NULL DEFAULT 0,
  inferred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const [c1]: any = await db.execute(sql`SHOW COLUMNS FROM orders LIKE 'decision_tags'`);
if (!c1.length) {
  await db.execute(sql`ALTER TABLE orders ADD COLUMN decision_tags JSON NULL AFTER quote`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN decision_note VARCHAR(255) NULL AFTER decision_tags`);
}
console.log("migration ok");
process.exit(0);
