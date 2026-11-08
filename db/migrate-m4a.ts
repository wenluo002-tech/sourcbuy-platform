// M4a 买家后台建表：addresses + notifications（新表手动建，绝不 truncate；幂等可重跑）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();

const stmts = [
  `CREATE TABLE IF NOT EXISTS addresses (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(64) NULL,
    contact_name VARCHAR(128) NOT NULL,
    phone VARCHAR(64) NOT NULL,
    country VARCHAR(64) NOT NULL,
    state VARCHAR(128) NULL,
    city VARCHAR(128) NULL,
    address1 VARCHAR(255) NOT NULL,
    address2 VARCHAR(255) NULL,
    postcode VARCHAR(32) NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX ix_addr_user (user_id, is_default)
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NULL,
    link VARCHAR(255) NULL,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_notif_user (user_id, read_at),
    INDEX ix_notif_created (user_id, created_at)
  )`,
];
for (const s of stmts) await db.execute(sql.raw(s));
const [t]: any = await db.execute(sql`SHOW TABLES LIKE 'addresses'`);
const [t2]: any = await db.execute(sql`SHOW TABLES LIKE 'notifications'`);
console.log("addresses:", t.length ? "OK" : "FAIL", "| notifications:", t2.length ? "OK" : "FAIL");
process.exit(0);
