// 迁移：temp_factory_checks 表（临时查厂留档，与严选库 factories 完全隔离）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const db: any = getDb();
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS temp_factory_checks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    query_name VARCHAR(128) NOT NULL,
    matched_title VARCHAR(255) NULL,
    seller_nick VARCHAR(64) NULL,
    status VARCHAR(16) NOT NULL,
    score INT NULL,
    report_json JSON NULL,
    cost_cny DECIMAL(8,3) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_qn (query_name),
    INDEX idx_user_date (user_id, created_at)
  )
`);
console.log("temp_factory_checks 就绪");
process.exit(0);
