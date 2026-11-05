// M3a 建表：users / auth_sessions / chat_threads / chat_messages（新表手动建，绝不 truncate）
import { loadEnvFile } from "node:process";
try { loadEnvFile(); } catch {}
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

const ddl = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(191) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(64) NULL,
    locale VARCHAR(8) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL,
    UNIQUE KEY uq_users_email (email)
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_auth_token (token_hash),
    KEY ix_auth_user (user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_threads (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    anon_id VARCHAR(36) NULL,
    title VARCHAR(255) NULL,
    locale VARCHAR(8) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_threads_user (user_id, updated_at),
    KEY ix_threads_anon (anon_id, updated_at)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    thread_id BIGINT UNSIGNED NOT NULL,
    role ENUM('user','assistant') NOT NULL,
    content TEXT NOT NULL,
    payload JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_msgs_thread (thread_id, id)
  )`,
];

const db = getDb();
for (const s of ddl) {
  await db.execute(sql.raw(s));
  console.log("ok:", s.slice(13, 60).split("(")[0].trim());
}
const [rows]: any = await db.execute(sql`SHOW TABLES`);
console.log("tables:", (rows as any[]).map((r) => Object.values(r)[0]).join(","));
process.exit(0);
