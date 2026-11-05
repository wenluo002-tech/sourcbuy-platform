// M3b 建表迁移：orders + order_events（手动建表，绝不 truncate）
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
await db.execute(sql`CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(24) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  thread_id BIGINT UNSIGNED NULL,
  offer_id VARCHAR(32) NULL,
  product_title VARCHAR(512) NULL,
  product_image VARCHAR(1024) NULL,
  quantity INT NULL,
  destination VARCHAR(128) NULL,
  demand TEXT NULL,
  status ENUM('inquiry','quoted','pending_payment','sourcing','inspecting','shipped','received','cancelled') NOT NULL DEFAULT 'inquiry',
  quote JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_no (order_no),
  KEY ix_orders_user (user_id, updated_at)
)`);
await db.execute(sql`CREATE TABLE IF NOT EXISTS order_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(24) NULL,
  to_status VARCHAR(24) NOT NULL,
  actor ENUM('buyer','ops','system') NOT NULL,
  note VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_oevents_order (order_id, id)
)`);
console.log("M3b 建表完成：orders + order_events");
process.exit(0);
