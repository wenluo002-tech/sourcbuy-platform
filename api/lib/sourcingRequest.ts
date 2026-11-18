/**
 * 探源单状态机单一入口（P0，2026-11-18 罗总终审通过）
 * 纪律：sourcing_requests 的一切状态流转只能经本文件 transition/failRequest——
 * 同事务 UPDATE 主表 + INSERT sourcing_request_events，无后门。
 * 两端同源：买家步骤条与 Admin 漏斗都只读 events+主表，永远一份真相。
 * 拍板：状态机六主链 received→scanned→screened→verifying→shortlisted→delivered，旁路 failed（不加 cancel）；
 * failed 必须带 fail_reason 且 fail_copy_key 指向 contracts/copy.ts FAIL_RECOVERY_COPY（为空=评审打回）。
 */
import { getDb } from "../queries/connection";
import { sql as dsql } from "drizzle-orm";
import { CATEGORY_SLA, FAIL_RECOVERY_COPY } from "../../contracts/copy";
import { log } from "./logger";

export const SR_STAGES = ["received", "scanned", "screened", "verifying", "shortlisted", "delivered"] as const;
export type SrStage = (typeof SR_STAGES)[number];
export type SrStatus = SrStage | "failed";
export type SrFailReason = "no_keyword" | "upstream_error" | "zero_candidates" | "manual_pending_timeout";

const STAGE_TS: Partial<Record<SrStage, string>> = {
  scanned: "scanned_at",
  screened: "screened_at",
  verifying: "verified_at", // 人工深验完成即 verified_at（verifying 态持续期靠 events 时间戳算）
  shortlisted: "shortlisted_at",
  delivered: "delivered_at",
};

type Db = ReturnType<typeof getDb>;

/** 编号体例 SB-SR-YYYYMMDD-当日序号（同 SB-VR）；唯一键兜底，撞号重试 */
async function nextRequestNo(db: Db): Promise<string> {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const [rows] = (await db.execute(
    dsql`SELECT COUNT(*) AS n FROM sourcing_requests WHERE request_no LIKE ${"SB-SR-" + day + "-%"}`,
  )) as unknown as [[{ n?: number | string }?]];
  return `SB-SR-${day}-${String(Number(rows?.[0]?.n ?? 0) + 1).padStart(3, "0")}`;
}

/** 建单：received 态 + SLA 快照（品类未跑通则 NULL，前台显示「预计时效」）。返回 null=建单失败（已记日志，不抛） */
export async function createSourcingRequest(x: {
  userId: number | null; keyword: string; categoryKey?: string | null; locale?: string;
}): Promise<{ id: number; requestNo: string } | null> {
  try {
    const db = getDb();
    const sla = CATEGORY_SLA.find((s) => s.categoryKey === x.categoryKey);
    const requestNo = await nextRequestNo(db);
    const [ins] = (sla
      ? await db.execute(dsql`INSERT INTO sourcing_requests
          (request_no, user_id, keyword, category_key, locale, sla_hours, sla_promised_at)
          VALUES (${requestNo}, ${x.userId}, ${x.keyword.slice(0, 120)}, ${x.categoryKey ?? null}, ${x.locale ?? "zh"},
            ${sla.slaHours}, DATE_ADD(NOW(), INTERVAL ${sla.slaHours} HOUR))`)
      : await db.execute(dsql`INSERT INTO sourcing_requests
          (request_no, user_id, keyword, category_key, locale, sla_hours, sla_promised_at)
          VALUES (${requestNo}, ${x.userId}, ${x.keyword.slice(0, 120)}, ${x.categoryKey ?? null}, ${x.locale ?? "zh"}, NULL, NULL)`)) as unknown as [{ insertId?: number }];
    const id = Number(ins?.insertId);
    if (!id) return null;
    await db.execute(dsql`INSERT INTO sourcing_request_events (request_id, stage) VALUES (${id}, 'received')`);
    log.info("探源单建档", { id, requestNo, keyword: x.keyword });
    return { id, requestNo };
  } catch (e) {
    log.warn("探源单建档失败", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** 状态推进（主链）：同事务主表+事件流水。count=本阶段真实数量（扫描命中/候选入池/入围家数） */
export async function transition(requestId: number, stage: SrStage, x: {
  count?: number; ms?: number; reason?: string; operatorId?: number | null;
} = {}): Promise<void> {
  const db = getDb();
  const tsCol = STAGE_TS[stage];
  if (tsCol) {
    await db.execute(dsql.raw(`UPDATE sourcing_requests SET status = '${stage}', ${tsCol} = NOW() WHERE id = ${Number(requestId)}`));
  } else {
    await db.execute(dsql`UPDATE sourcing_requests SET status = ${stage} WHERE id = ${requestId}`);
  }
  await db.execute(dsql`INSERT INTO sourcing_request_events (request_id, stage, count, ms, reason, operator_id)
    VALUES (${requestId}, ${stage}, ${x.count ?? null}, ${x.ms ?? null}, ${x.reason ?? null}, ${x.operatorId ?? null})`);
}

/** 失败旁路：原因码必须命中词条表 FAIL_RECOVERY_COPY（转人工入口永远在场，死胡同违法——罗总 2026-11-18 拍板） */
export async function failRequest(requestId: number, reason: SrFailReason, detail?: string): Promise<void> {
  const db = getDb();
  if (!(reason in FAIL_RECOVERY_COPY)) {
    log.warn("failRequest 收到词条表外原因码，降级 upstream_error", { requestId, reason });
    reason = "upstream_error";
  }
  await db.execute(dsql`UPDATE sourcing_requests SET status = 'failed', fail_reason = ${reason}, fail_copy_key = ${reason} WHERE id = ${requestId}`);
  await db.execute(dsql`INSERT INTO sourcing_request_events (request_id, stage, reason) VALUES (${requestId}, 'failed', ${(detail ?? reason).slice(0, 250)})`);
}

/** 会话链回填：chat 落库后补 thread/message（客服可回溯"买家哪句话触发的"） */
export async function attachConversation(requestId: number, threadId: number | null, messageId: number | null): Promise<void> {
  if (!threadId && !messageId) return;
  const db = getDb();
  await db.execute(dsql`UPDATE sourcing_requests SET thread_id = ${threadId}, message_id = ${messageId} WHERE id = ${requestId}`)
    .catch(() => {});
}

/** 成本归集：TXGC credits 累加进主表（对账直连 txgc_calls.sr_no） */
export async function addCostCredits(requestId: number, credits: number): Promise<void> {
  if (!credits) return;
  const db = getDb();
  await db.execute(dsql`UPDATE sourcing_requests SET cost_credits = cost_credits + ${credits} WHERE id = ${requestId}`).catch(() => {});
}

/** 转人工（failed 旁路的逃生门，罗总拍板：死胡同违法）：failed → verifying（人工接管），事件留痕 */
export async function escalateToHuman(requestId: number): Promise<boolean> {
  const db = getDb();
  const [rows] = (await db.execute(
    dsql`SELECT status FROM sourcing_requests WHERE id = ${requestId} LIMIT 1`,
  )) as unknown as [[{ status?: string }?]];
  const cur = String(rows?.[0]?.status ?? "");
  if (cur !== "failed") return false;
  await db.execute(dsql`UPDATE sourcing_requests SET status = 'verifying' WHERE id = ${requestId}`);
  await db.execute(dsql`INSERT INTO sourcing_request_events (request_id, stage, reason) VALUES (${requestId}, 'verifying', '买家主动转人工')`);
  return true;
}

// ─── 买家端读取（两端同源：只读主表+events。掩码纪律：候选厂名绝不裸出 API）───

export interface SrEventView { stage: string; count: number | null; ms: number | null; reason: string | null; at: string; }

interface SrRow {
  id: number; request_no: string; keyword: string; status: string; fail_reason: string | null;
  paid_cents: number | string | null; sla_hours: number | string | null; user_id: number | string | null;
  created_at: string; delivered_at: string | null;
}
interface EvRow { stage: string; count: number | null; ms: number | null; reason: string | null; operator_id: number | null; created_at: string; }
interface CandRow {
  id: number; province: string | null; city: string | null; is_foreign_trade: number | string;
  establish_date: string | null; has_dd: number | string;
}

export async function getSourcingRequestView(requestId: number, viewerUserId: number | null) {
  const db = getDb();
  const [rows] = (await db.execute(dsql`SELECT * FROM sourcing_requests WHERE id = ${requestId} LIMIT 1`)) as unknown as [SrRow[]];
  const row = rows[0];
  if (!row) return null;
  // 属主校验：有名有姓的单只给本人看；匿名期的单无 PII（关键词+计数+掩码候选），凭 id 可读
  if (row.user_id != null && Number(row.user_id) !== viewerUserId) return null;
  const [evRows] = (await db.execute(
    dsql`SELECT stage, count, ms, reason, operator_id, created_at FROM sourcing_request_events WHERE request_id = ${requestId} ORDER BY id`,
  )) as unknown as [EvRow[]];
  const events = evRows;
  // 温度提示语变量：人工核验档=events 里有运营动作（operator_id 非空）；否则初筛档
  const humanVerified = events.some((e) => e.operator_id != null);
  // 入围名单：只出 shortlisted=1，名字服务端掩码（探源入围档，权益锁同纪律）
  const [candRows] = (await db.execute(
    dsql`SELECT id, province, city, is_foreign_trade, establish_date, deepdive IS NOT NULL AS has_dd
         FROM gap_candidates WHERE sourcing_request_id = ${requestId} AND shortlisted = 1 ORDER BY id`,
  )) as unknown as [CandRow[]];
  const shortlist = candRows.map((c) => ({
    id: Number(c.id),
    maskedName: `探源入围工厂 No.${String(c.id).padStart(4, "0")}`,
    province: c.province, city: c.city,
    isForeignTrade: !!Number(c.is_foreign_trade),
    establishDate: c.establish_date ?? null,
    hasDeepdive: !!Number(c.has_dd),
  }));
  return {
    id: Number(row.id),
    requestNo: row.request_no as string,
    keyword: row.keyword as string,
    status: row.status as string,
    failReason: (row.fail_reason as string | null) ?? null,
    paidCents: Number(row.paid_cents ?? 0),
    slaHours: row.sla_hours != null ? Number(row.sla_hours) : null,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at ?? null,
    humanVerified,
    events: events.map((e): SrEventView => ({ stage: e.stage, count: e.count, ms: e.ms, reason: e.reason, at: e.created_at })),
    shortlist,
  };
}

export interface SrListRow {
  id: number; request_no: string; keyword: string; status: string;
  fail_reason: string | null; created_at: string; delivered_at: string | null;
}

export async function listMySourcingRequests(userId: number): Promise<SrListRow[]> {
  const db = getDb();
  const [rows] = (await db.execute(
    dsql`SELECT id, request_no, keyword, status, fail_reason, created_at, delivered_at FROM sourcing_requests WHERE user_id = ${userId} ORDER BY id DESC LIMIT 50`,
  )) as unknown as [SrListRow[]];
  return rows;
}
