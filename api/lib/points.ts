// ═══ P4 积分账本服务（2026-11-17 罗总拍板口径）═══
// 规则冻结：注册即送 1,000 分（每账号一次，bonus/register_gift）；
//   第一段实付（货款+佣金）每 $1=1 分取整，国际运费与通道费不计，退款按比例扣回（可为负挂账）；
//   1,000 分兑 1 份核查报告，生成失败自动退分；v1 不设有效期；QA/测试号不计分；
//   所有入账/扣减走 dedup_key 唯一索引防重放，余额=SUM(delta) 纯流水可追溯。
// 经济锁定位：本表同时是防跳单经济锁后半（质检券/免佣额度）的地基，后续只是新增 reason。
import { getDb } from "../queries/connection";
import { sql as dsql } from "drizzle-orm";

export const REPORT_COST = 1000; // 1 份核查报告 = 1,000 分

export type PointKind = "earn" | "bonus" | "redeem" | "refund" | "adjust";
export type PointReason =
  | "register_gift" | "order_payment" | "refund_clawback"
  | "report_redeem" | "report_refund" | "manual_adjust";

// QA/测试号一律不计分（qa-suite 与人工测试账号都在 @test.com 域）
export const isTestEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith("@test.com");

/** 记一笔积分流水。dedupKey 命中唯一索引 = 重放，静默跳过返回 false。 */
export async function awardPoints(opts: {
  userId: number; delta: number; kind: PointKind; reason: PointReason;
  dedupKey: string; orderId?: number; reportId?: number; note?: string;
}): Promise<boolean> {
  const db = getDb();
  const r: any = await db.execute(dsql`INSERT IGNORE INTO points_ledger
    (user_id, delta, kind, reason, dedup_key, order_id, report_id, note)
    VALUES (${opts.userId}, ${opts.delta}, ${opts.kind}, ${opts.reason}, ${opts.dedupKey},
            ${opts.orderId ?? null}, ${opts.reportId ?? null}, ${opts.note ?? null})`);
  return Number(r[0]?.affectedRows ?? 0) > 0;
}

export async function balanceOf(userId: number): Promise<number> {
  const db = getDb();
  const r: any = await db.execute(dsql`SELECT COALESCE(SUM(delta),0) AS bal FROM points_ledger WHERE user_id = ${userId}`);
  return Number(r[0]?.[0]?.bal ?? 0);
}

export async function ledgerOf(userId: number, limit = 50) {
  const db = getDb();
  const r: any = await db.execute(dsql`SELECT id, delta, kind, reason, order_id, report_id, note, created_at
    FROM points_ledger WHERE user_id = ${userId} ORDER BY id DESC LIMIT ${Math.min(limit, 200)}`);
  return r[0] as any[];
}

/** 注册礼：1,000 分，每账号一次。失败不阻塞注册主流程。 */
export async function awardRegisterGift(userId: number, email?: string | null) {
  if (isTestEmail(email)) return;
  try {
    await awardPoints({ userId, delta: REPORT_COST, kind: "bonus", reason: "register_gift", dedupKey: `register_gift:${userId}`, note: "注册礼：1 份供应商核查报告" });
  } catch (e) { console.error("[points] register gift failed", e); }
}

/** 第一段实付积分：每 $1=1 分取整。M6 OnlyPay 支付成功回调接入点。 */
export async function awardOrderPayment(opts: { userId: number; orderId: number; paidUsd: number; email?: string | null }) {
  if (isTestEmail(opts.email)) return;
  const pts = Math.floor(opts.paidUsd);
  if (pts <= 0) return;
  await awardPoints({ userId: opts.userId, delta: pts, kind: "earn", reason: "order_payment", dedupKey: `order_payment:${opts.orderId}`, orderId: opts.orderId, note: `第一段实付 $${opts.paidUsd.toFixed(2)} → ${pts} 分` });
}

/** 退款按比例扣回：可为负挂账，后续进账自然抵扣。M6 退款回调接入点。 */
export async function clawbackRefund(opts: { userId: number; orderId: number; refundUsd: number }) {
  const pts = Math.floor(opts.refundUsd);
  if (pts <= 0) return;
  await awardPoints({ userId: opts.userId, delta: -pts, kind: "adjust", reason: "refund_clawback", dedupKey: `refund_clawback:${opts.orderId}`, orderId: opts.orderId, note: `退款 $${opts.refundUsd.toFixed(2)} 扣回 ${pts} 分` });
}

/** 兑换核查报告：余额 ≥1000 才扣（先查后写，写失败=并发撞单不重复扣）。 */
export async function redeemForReport(userId: number, reportId: number): Promise<"ok" | "not_enough"> {
  const bal = await balanceOf(userId);
  if (bal < REPORT_COST) return "not_enough";
  const wrote = await awardPoints({ userId, delta: -REPORT_COST, kind: "redeem", reason: "report_redeem", dedupKey: `report_redeem:${reportId}`, reportId, note: "兑换供应商核查报告" });
  return wrote ? "ok" : "not_enough";
}

/** 生成失败自动退分（与扣减同 dedup 域，幂等）。 */
export async function refundReport(userId: number, reportId: number) {
  await awardPoints({ userId, delta: REPORT_COST, kind: "refund", reason: "report_refund", dedupKey: `report_refund:${reportId}`, reportId, note: "报告生成失败自动退分" });
}
