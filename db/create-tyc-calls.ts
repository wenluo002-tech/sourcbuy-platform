/** 建 tyc_calls 台账表（幂等，可重跑） */
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";

async function main() {
  const db = getDb();
  await db.execute(dsql`CREATE TABLE IF NOT EXISTS tyc_calls (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_name VARCHAR(128) NOT NULL,
    ok TINYINT NOT NULL DEFAULT 0,
    err VARCHAR(200) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at)
  )`);
  console.log("tyc_calls 就绪");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
