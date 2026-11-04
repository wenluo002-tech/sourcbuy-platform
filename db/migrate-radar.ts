import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
try { process.loadEnvFile(); } catch {}
async function main() {
  const db = getDb();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS radar_items (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title varchar(128) NOT NULL,
    title_en varchar(255),
    keyword varchar(128) NOT NULL,
    signal_source enum('amazon','tiktok') NOT NULL,
    signal_text varchar(255) NOT NULL,
    signal_url text,
    signal_date varchar(16) NOT NULL,
    retail_price_usd decimal(8,2),
    factory_price_min decimal(8,2),
    factory_price_max decimal(8,2),
    upstream_count int,
    vetted_count int NOT NULL DEFAULT 0,
    top_sales int,
    note text,
    sort_order int NOT NULL DEFAULT 0,
    active tinyint(1) NOT NULL DEFAULT 1,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_radar_active (active, sort_order)
  )`);
  const [r]: any = await db.execute(sql`SHOW TABLES LIKE 'radar_items'`);
  console.log("radar_items exists:", (r?.length ?? 0) > 0);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
