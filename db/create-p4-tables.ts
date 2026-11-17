// ═══ P4 工厂核查报告 + 积分系统：建表（新表手动建，绝不 truncate）═══
// 用法：npx tsx db/create-p4-tables.ts
// 设计口径（2026-11-17 罗总拍板）：
//   points_ledger = 流水账，余额=SUM(delta)，dedup_key 唯一索引兜底幂等（注册礼/支付入账/退款扣回/兑换/退分 全部防重放）
//   verification_reports = 报告档案，report_json 快照同时喂在线页与 PDF，结果回流我方库（in_our_system/factory_id）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS points_ledger (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    delta INT NOT NULL,                     -- 正=入账 负=扣减（可为负挂账抵扣后续）
    kind VARCHAR(16) NOT NULL,              -- earn/bonus/redeem/refund/adjust
    reason VARCHAR(32) NOT NULL,            -- register_gift/order_payment/refund_clawback/report_redeem/report_refund/manual_adjust
    dedup_key VARCHAR(80) NULL,             -- 幂等键 register_gift:{uid} / order_payment:{orderId} / report_redeem:{reportId} / report_refund:{reportId} / refund_clawback:{orderId}
    order_id BIGINT UNSIGNED NULL,
    report_id BIGINT UNSIGNED NULL,
    note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_points_dedup (dedup_key),
    INDEX ix_points_user (user_id, id)
  )`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS verification_reports (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    report_no VARCHAR(24) NOT NULL,         -- SB-VR-YYYYMMDD-XXX 展示+验真编号
    user_id BIGINT UNSIGNED NOT NULL,
    company_name VARCHAR(255) NOT NULL,     -- 买家输入厂名原文
    company_key VARCHAR(255) NULL,          -- 归一化厂名（撞库与检索用）
    status VARCHAR(16) NOT NULL DEFAULT 'generating', -- generating/ready/failed
    locale VARCHAR(8) DEFAULT 'zh',
    txgc_id BIGINT NULL,                    -- 天下工厂公司 id（命中上游档案时）
    factory_id BIGINT UNSIGNED NULL,        -- 撞我方严选库命中的 factory id
    in_our_system TINYINT NOT NULL DEFAULT 0, -- 命中即亮「已在严选体系内」
    product_word VARCHAR(128) NULL,         -- 买家关心的产品词（价格情报模块用）
    report JSON NULL,                       -- 报告数据快照（在线页+PDF 共用单一事实源）
    pdf_path VARCHAR(255) NULL,
    error VARCHAR(255) NULL,
    cost_credits INT NOT NULL DEFAULT 0,    -- TXGC credits 消耗对账
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_report_no (report_no),
    INDEX ix_vr_user (user_id, id)
  )`);
  console.log("points_ledger / verification_reports 建表完成");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
