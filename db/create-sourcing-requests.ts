// ═══ 探源引擎主表建库（P0，2026-11-18 罗总终审通过 DDL 草案 v1）═══
// 用法：npx tsx db/create-sourcing-requests.ts
// 拍板口径（罗总 2026-11-18）：
//   ① 状态机不加 cancel，failed 覆盖 ② 粗筛原因码四个先行，不够再做成配置字典扩充
//   ③ assigned_to 直指 users.id，不建 staff 表 ④ txgc_calls 加 sr_no 对账
// 纪律：新表手动建、绝不 truncate；ALTER 幂等（information_schema 守卫）；两端同源=一切状态流转只经 api/lib/sourcingRequest.ts
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function hasColumn(db: any, table: string, col: string): Promise<boolean> {
  const r: any = await db.execute(
    sql`SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${col}`,
  );
  return Number(r[0]?.[0]?.c ?? 0) > 0;
}

async function main() {
  const db = getDb();

  await db.execute(sql`CREATE TABLE IF NOT EXISTS sourcing_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_no VARCHAR(24) NOT NULL,            -- SB-SR-YYYYMMDD-XXX 展示+对账编号（与 SB-VR 同体例）
    user_id BIGINT UNSIGNED NULL,               -- 触发买家（匿名会话允许 NULL，落库后归并）
    thread_id BIGINT UNSIGNED NULL,             -- 会话链：哪段对话触发的
    message_id BIGINT UNSIGNED NULL,            -- 会话链：具体哪条消息
    keyword VARCHAR(128) NOT NULL,              -- 提取后的产品词（extractProductWord 最长命中）
    category_key VARCHAR(64) NULL,              -- 命中品类桶 key，SLA 表按它查
    locale VARCHAR(8) DEFAULT 'zh',
    status VARCHAR(16) NOT NULL DEFAULT 'received',
    -- 主链：received → scanned → screened → verifying → shortlisted → delivered；旁路 failed（罗总拍板：不加 cancel）
    fail_reason VARCHAR(32) NULL,               -- no_keyword / upstream_error / zero_candidates / manual_pending_timeout
    fail_copy_key VARCHAR(48) NULL,             -- 词条表 contracts/copy.ts FAIL_RECOVERY_COPY 键名；为空=评审打回
    sla_hours INT NULL,                         -- 落单时从 contracts CATEGORY_SLA 快照；NULL=该品类未跑通，前台显示「预计时效」
    sla_promised_at TIMESTAMP NULL,
    expedited TINYINT NOT NULL DEFAULT 0,       -- 加急预留（收费点①）
    deep_diligence TINYINT NOT NULL DEFAULT 0,  -- 深度尽调预留（收费点②）
    paid_cents INT NOT NULL DEFAULT 0,          -- 已收费用（分）；=0 时前台亮「本次探源免费」
    payment_id VARCHAR(64) NULL,
    assigned_to BIGINT UNSIGNED NULL,           -- 验证员=users.id（罗总拍板，不建 staff 表）；NULL=待验任务池成员
    assigned_at TIMESTAMP NULL,
    cost_credits INT NOT NULL DEFAULT 0,        -- TXGC credits 合计（对账）
    cost_cny_cents INT NOT NULL DEFAULT 0,      -- 其他源成本（分）
    scanned_at TIMESTAMP NULL,
    screened_at TIMESTAMP NULL,
    verified_at TIMESTAMP NULL,
    shortlisted_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sr_no (request_no),
    INDEX ix_sr_user (user_id, id),
    INDEX ix_sr_status (status, id),
    INDEX ix_sr_assignee (assigned_to, status)
  )`);
  console.log("sourcing_requests OK");

  await db.execute(sql`CREATE TABLE IF NOT EXISTS sourcing_request_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_id BIGINT UNSIGNED NOT NULL,        -- sourcing_requests.id
    stage VARCHAR(16) NOT NULL,                 -- received/scanned/screened/verifying/shortlisted/delivered/failed
    count INT NULL,                             -- 本阶段真实数量（扫描命中 N/粗筛过 M/入围 K）
    ms INT NULL,
    reason VARCHAR(255) NULL,                   -- 卡住/失败原因（Admin「为什么卡」直接读）
    operator_id BIGINT UNSIGNED NULL,           -- NULL=系统动作
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_sre_req (request_id, id),
    INDEX ix_sre_stage (stage, created_at)
  )`);
  console.log("sourcing_request_events OK");

  // gap_candidates 子状态挂主表（幂等 ALTER）
  const alters: Array<[string, string]> = [
    ["sourcing_request_id", "ADD COLUMN sourcing_request_id BIGINT UNSIGNED NULL AFTER request_id"],
    ["source", "ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'txgc'"],
    ["screening", "ADD COLUMN screening VARCHAR(8) NULL"],             // pass/reject；NULL=待筛。纪律：只过滤不打分
    ["screening_reason", "ADD COLUMN screening_reason VARCHAR(32) NULL"],
    ["verify_status", "ADD COLUMN verify_status VARCHAR(12) NULL"],    // pending/pass/reject/need_more
    ["operator_id", "ADD COLUMN operator_id BIGINT UNSIGNED NULL"],
    ["verified_at", "ADD COLUMN verified_at TIMESTAMP NULL"],
    ["verify_note", "ADD COLUMN verify_note VARCHAR(255) NULL"],
    ["shortlisted", "ADD COLUMN shortlisted TINYINT NOT NULL DEFAULT 0"],
    ["shortlisted_at", "ADD COLUMN shortlisted_at TIMESTAMP NULL"],
  ];
  for (const [col, ddl] of alters) {
    if (!(await hasColumn(db, "gap_candidates", col))) {
      await db.execute(sql.raw(`ALTER TABLE gap_candidates ${ddl}`));
      console.log(`gap_candidates +${col}`);
    }
  }
  const idx: any = await db.execute(
    sql`SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gap_candidates' AND INDEX_NAME = 'ix_gc_sr'`,
  );
  if (!Number(idx[0]?.[0]?.c ?? 0)) {
    await db.execute(sql.raw(`ALTER TABLE gap_candidates ADD INDEX ix_gc_sr (sourcing_request_id), ADD INDEX ix_gc_verify (verify_status)`));
    console.log("gap_candidates +indexes");
  }

  // txgc_calls 加 sr_no 对账列（罗总拍板④）。坑：TiDB 不接受同句 ADD COLUMN + ADD INDEX，拆两句
  if (!(await hasColumn(db, "txgc_calls", "sr_no"))) {
    await db.execute(sql.raw(`ALTER TABLE txgc_calls ADD COLUMN sr_no VARCHAR(24) NULL`));
    await db.execute(sql.raw(`ALTER TABLE txgc_calls ADD INDEX ix_txgc_sr (sr_no)`));
    console.log("txgc_calls +sr_no");
  }

  console.log("全部完成");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
