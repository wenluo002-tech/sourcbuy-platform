// ═══ P2 品类缺口候选池：建表（新表手动建，绝不 truncate）═══
// 用法：npx tsx db/create-gap-tables.ts
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS gap_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    keyword VARCHAR(128) NOT NULL,
    locale VARCHAR(8) DEFAULT 'zh',
    user_id BIGINT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending/enriched/error
    txgc_total INT NULL,                            -- 上游命中总数
    candidate_count INT NOT NULL DEFAULT 0,
    error VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    enriched_at TIMESTAMP NULL,
    INDEX idx_kw_created (keyword, created_at)
  )`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS gap_candidates (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_id BIGINT NOT NULL,
    txgc_id BIGINT NOT NULL,                        -- 天下工厂公司 id（detail/deepdive 定位用）
    name VARCHAR(255) NOT NULL,
    province VARCHAR(64) NULL,
    city VARCHAR(64) NULL,
    establish_date VARCHAR(16) NULL,
    registered_capital VARCHAR(64) NULL,
    is_foreign_trade TINYINT DEFAULT 0,
    is_specialized TINYINT DEFAULT 0,
    is_high_tech TINYINT DEFAULT 0,
    phones_count INT DEFAULT 0,
    decision_maker_count INT DEFAULT 0,
    main_products JSON NULL,
    tags JSON NULL,
    deepdive JSON NULL,                             -- deepdive 结果缓存（summary/structured/report_md/sources）
    deepdived_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_req_txgc (request_id, txgc_id),
    INDEX idx_request (request_id)
  )`);
  console.log("gap_requests / gap_candidates 建表完成");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
