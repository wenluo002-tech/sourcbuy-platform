// 一次性建表：legacy_products（DDL 与 import-legacy-products.ts 内 CREATE_SQL 保持一致）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const db = getDb();
const t = (await db.execute(sql`SHOW TABLES LIKE 'legacy_products'`)) as any;
const exists = (Array.isArray(t) ? (Array.isArray(t[0]) ? t[0] : t) : []).length > 0;
if (exists) { console.log("表已存在，跳过"); process.exit(0); }
await db.execute(sql.raw(`CREATE TABLE legacy_products (
  product_id VARCHAR(32) PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  spec_json TEXT, spec_text TEXT,
  fine_category VARCHAR(128),
  member_id VARCHAR(64), factory_name VARCHAR(255),
  factory_score DECIMAL(4,1),
  tier_legacy VARCHAR(16),
  price_cny DECIMAL(12,2),
  price_suspect TINYINT NOT NULL DEFAULT 0,
  moq_text VARCHAR(64), moq_min INT,
  image TEXT,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_lp_member (member_id), INDEX ix_lp_cat (fine_category), INDEX ix_lp_score (factory_score)
)`));
console.log("✓ legacy_products 已建");
process.exit(0);
