// 质检双检建表：inspection_reports + inspection_evidences + orders.status 枚举扩到 17+1 态（2026-11-09 PRD v1.1）
// 幂等可重跑；新表手动建，绝不 truncate
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();

const NEW_STATUSES = [
  "inquiry", "quoted", "pending_payment", "sourcing", "producing", "goods_ready",
  "insp1_uploading", "insp1_review", "insp1_passed",
  "shipped", "in_warehouse", "insp2_review", "insp2_passed",
  "awaiting_phase2_pay", "phase2_paid", "dispatched", "received", "cancelled",
];

const stmts = [
  `CREATE TABLE IF NOT EXISTS inspection_reports (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    report_no VARCHAR(24) NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    phase INT NOT NULL,
    template VARCHAR(32) NOT NULL DEFAULT 'generic',
    status ENUM('uploading','pending_review','passed','rework','rejected','signed') NOT NULL DEFAULT 'uploading',
    upload_token VARCHAR(64) NOT NULL,
    token_expires_at TIMESTAMP NULL,
    verdict ENUM('pass','conditional','rework','reject') NULL,
    inspector_note TEXT NULL,
    inspector_id BIGINT UNSIGNED NULL,
    factory_sign_path VARCHAR(512) NULL,
    pdf_path VARCHAR(512) NULL,
    measured_weight_kg DECIMAL(10,3) NULL,
    measured_volume_cbm DECIMAL(10,4) NULL,
    reviewed_at TIMESTAMP NULL,
    signed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_insp_no (report_no),
    UNIQUE KEY uq_insp_token (upload_token),
    INDEX ix_insp_order (order_id, phase)
  )`,
  `CREATE TABLE IF NOT EXISTS inspection_evidences (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    report_id BIGINT UNSIGNED NOT NULL,
    item_code VARCHAR(32) NOT NULL,
    media_type ENUM('photo','video') NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    file_size INT NOT NULL,
    uploaded_by ENUM('factory','warehouse','ops') NOT NULL,
    note VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_ievd_report (report_id, item_code)
  )`,
  // 订单状态机扩到 17+1 态（旧值 inquiry/quoted/pending_payment/sourcing/inspecting/shipped/received/cancelled 全保留在新枚举里，映射无损）
  `ALTER TABLE orders MODIFY status ENUM(${NEW_STATUSES.map((s) => `'${s}'`).join(",")}) NOT NULL DEFAULT 'inquiry'`,
  // order_events.from/to_status 长度 24 → 32（insp1_uploading=15 放得下，但留余量防后续加长）
  `ALTER TABLE order_events MODIFY from_status VARCHAR(32) NULL`,
  `ALTER TABLE order_events MODIFY to_status VARCHAR(32) NOT NULL`,
];
for (const s of stmts) await db.execute(sql.raw(s));

// 验证：两表存在 + orders.status 枚举含新态
const [t1]: any = await db.execute(sql`SHOW TABLES LIKE 'inspection_reports'`);
const [t2]: any = await db.execute(sql`SHOW TABLES LIKE 'inspection_evidences'`);
const [cols]: any = await db.execute(sql`SHOW COLUMNS FROM orders LIKE 'status'`);
const enumText = cols[0]?.Type ?? "";
const missing = NEW_STATUSES.filter((s) => !enumText.includes(`'${s}'`));
console.log("inspection_reports:", t1.length ? "OK" : "FAIL");
console.log("inspection_evidences:", t2.length ? "OK" : "FAIL");
console.log("orders.status enum:", missing.length === 0 ? `OK (${NEW_STATUSES.length} 态)` : `FAIL 缺 ${missing.join(",")}`);

// 存量订单状态抽查（入库铁律：实际 SELECT）
const [rows]: any = await db.execute(sql`SELECT id, order_no, status FROM orders ORDER BY id DESC LIMIT 5`);
console.log("存量订单抽查:", rows.map((r: any) => `#${r.id} ${r.order_no}=${r.status}`).join(" | ") || "(空表)");
process.exit(0);
