// 质检双检查询层（2026-11-09 PRD v1.1，罗总拍板）
// 一检：工厂端凭 token H5 上传证据 → 提交 → 运营人工判定（pass/conditional/rework/reject）
// 二检：入仓后仓库端上传 + 实测重量/体积（第二段账单出账依据）
// 铁律：AI 只做预检，判定权永远在我方质检员；买家永不看到 uploadToken
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./connection";
import { inspectionReports, inspectionEvidences, orders, notifications } from "../../db/schema";
import { transitionOrder, logOrderEvent } from "./orders";
import {
  getTemplate,
  requiredSatisfied,
  inspReportNo,
  PHASE_LABEL,
  FACTORY_SEAL_ITEM,
  type InspVerdict,
} from "../../contracts/inspection";

const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000; // 工厂上传令牌默认 7 天

function genToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8); // 40 位
}

async function notifyBuyer(userId: number, title: string, body: string, link: string) {
  try {
    const db = await getDb();
    await db.insert(notifications).values({ userId, type: "order_status", title, body, link });
  } catch {
    /* 通知失败不挡主流程 */
  }
}

// ─── 运营：创建质检报告（一检挂在 goods_ready，二检挂在 in_warehouse）───
export async function createReport(input: { orderId: number; phase: 1 | 2; template?: string }) {
  const db = await getDb();
  const rows = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  const o = rows[0];
  if (!o) return { ok: false as const, error: "NOT_FOUND" };
  const needStatus = input.phase === 1 ? "goods_ready" : "in_warehouse";
  if (o.status !== needStatus) return { ok: false as const, error: "BAD_STATE", current: o.status, need: needStatus };
  // 同一订单同一阶段已有未终结报告（uploading/pending_review/passed/signed）则不重复开
  const existing = await db
    .select()
    .from(inspectionReports)
    .where(and(eq(inspectionReports.orderId, input.orderId), eq(inspectionReports.phase, input.phase)))
    .orderBy(desc(inspectionReports.id));
  const active = existing.find((r) => ["uploading", "pending_review", "passed", "signed"].includes(r.status));
  if (active) return { ok: false as const, error: "ALREADY_EXISTS", reportId: Number(active.id), reportNo: active.reportNo };
  const token = genToken();
  const r = await db.insert(inspectionReports).values({
    reportNo: "TMP",
    orderId: input.orderId,
    phase: input.phase,
    template: input.template ?? "generic",
    status: "uploading",
    uploadToken: token,
    tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  const reportId = Number(r[0].insertId);
  const reportNo = inspReportNo(reportId);
  await db.update(inspectionReports).set({ reportNo }).where(eq(inspectionReports.id, reportId));
  const tr = await transitionOrder({
    orderId: input.orderId,
    to: input.phase === 1 ? "insp1_uploading" : "insp2_review",
    actor: "ops",
    note: `创建${PHASE_LABEL[input.phase].zh}报告 ${reportNo}`,
  });
  if (!tr.ok) return { ok: false as const, error: "BAD_TRANSITION", from: tr.from, to: tr.to };
  return { ok: true as const, reportId, reportNo, token };
}

// ─── 工厂/仓库端：凭 token 读上传页数据（清单模板 + 已传件数 + 订单简述）───
export async function getByToken(token: string) {
  const db = await getDb();
  const rows = await db.select().from(inspectionReports).where(eq(inspectionReports.uploadToken, token)).limit(1);
  const r = rows[0];
  if (!r) return null;
  if (r.tokenExpiresAt && r.tokenExpiresAt.getTime() < Date.now()) return { expired: true as const, reportNo: r.reportNo };
  const o = (await db.select().from(orders).where(eq(orders.id, r.orderId)).limit(1))[0];
  const counts = await evidenceCounts(Number(r.id));
  const tpl = getTemplate(r.template);
  const items =
    r.status === "passed" && r.phase === 1
      ? [...tpl.items, FACTORY_SEAL_ITEM] // 判定合格后追加盖章回传项
      : tpl.items;
  return {
    expired: false as const,
    reportId: Number(r.id),
    reportNo: r.reportNo,
    phase: r.phase,
    status: r.status,
    verdict: r.verdict,
    inspectorNote: r.inspectorNote,
    orderNo: o?.orderNo ?? "",
    productTitle: o?.productTitle ?? "",
    quantity: o?.quantity ?? null,
    template: { id: tpl.id, nameZh: tpl.nameZh, items },
    counts,
  };
}

export async function evidenceCounts(reportId: number): Promise<Record<string, number>> {
  const db = await getDb();
  const [rows]: any = await db.execute(
    sql`SELECT item_code AS c, COUNT(*) AS n FROM inspection_evidences WHERE report_id = ${reportId} GROUP BY item_code`
  );
  const out: Record<string, number> = {};
  for (const row of rows as any[]) out[row.c] = Number(row.n);
  return out;
}

// ─── REST 上传端点落库（文件已存盘后调用）───
export async function registerEvidence(input: {
  reportId: number;
  itemCode: string;
  mediaType: "photo" | "video" | "file";
  filePath: string;
  fileSize: number;
  uploadedBy: "factory" | "warehouse" | "ops";
  note?: string;
}) {
  const db = await getDb();
  const r = await db.insert(inspectionEvidences).values({
    reportId: input.reportId,
    itemCode: input.itemCode,
    mediaType: input.mediaType,
    filePath: input.filePath,
    fileSize: input.fileSize,
    uploadedBy: input.uploadedBy,
    note: input.note?.slice(0, 255) ?? null,
  });
  return { evidenceId: Number(r[0].insertId) };
}

// 上传权限校验：token 有效 + 报告处于可上传状态 + 清单项合法 + 媒体类型匹配
export async function validateUpload(token: string, itemCode: string, mediaType: "photo" | "video" | "file") {
  const ctx = await getByToken(token);
  if (!ctx || ctx.expired) return { ok: false as const, error: "TOKEN_INVALID" };
  if (ctx.status !== "uploading" && !(ctx.status === "passed" && itemCode === "factory_seal")) {
    return { ok: false as const, error: "NOT_UPLOADING", status: ctx.status };
  }
  const item = ctx.template.items.find((i) => i.code === itemCode);
  if (!item) return { ok: false as const, error: "BAD_ITEM" };
  if (item.media !== "any" && item.media !== mediaType) return { ok: false as const, error: "BAD_MEDIA", need: item.media };
  return {
    ok: true as const,
    reportId: ctx.reportId,
    uploadedBy: (ctx.phase === 1 ? "factory" : "warehouse") as "factory" | "warehouse",
  };
}

// ─── 工厂/仓库端：提交待判定（必拍项齐套校验，缺项打回）───
export async function submitByToken(token: string) {
  const ctx = await getByToken(token);
  if (!ctx || ctx.expired) return { ok: false as const, error: "TOKEN_INVALID" };
  if (ctx.status !== "uploading") return { ok: false as const, error: "NOT_UPLOADING", status: ctx.status };
  const chk = requiredSatisfied(ctx.template.id, ctx.counts);
  if (!chk.ok) return { ok: false as const, error: "MISSING_ITEMS", missing: chk.missing };
  const db = await getDb();
  await db
    .update(inspectionReports)
    .set({ status: "pending_review", updatedAt: new Date() })
    .where(eq(inspectionReports.id, ctx.reportId));
  if (ctx.phase === 1) {
    const rep = (await db.select().from(inspectionReports).where(eq(inspectionReports.id, ctx.reportId)).limit(1))[0];
    await transitionOrder({ orderId: Number(rep.orderId), to: "insp1_review", actor: "ops", note: `${ctx.reportNo} 证据齐套，提交判定` });
  }
  return { ok: true as const };
}

// ─── 运营：判定（AI 只预检，这是人工入口）───
// pass/conditional → passed；rework → 报告打回 + 一检订单回 producing；reject → 报告拒收 + 订单不回退（异常处置留痕）
export async function reviewReport(input: { reportId: number; verdict: InspVerdict; note?: string; inspectorId: number }) {
  const db = await getDb();
  const rows = await db.select().from(inspectionReports).where(eq(inspectionReports.id, input.reportId)).limit(1);
  const rep = rows[0];
  if (!rep) return { ok: false as const, error: "NOT_FOUND" };
  if (rep.status !== "pending_review") return { ok: false as const, error: "BAD_STATE", status: rep.status };
  const orderId = Number(rep.orderId);
  const o = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  const phaseZh = PHASE_LABEL[rep.phase as 1 | 2].zh;

  if (input.verdict === "pass" || input.verdict === "conditional") {
    await db
      .update(inspectionReports)
      .set({ status: "passed", verdict: input.verdict, inspectorNote: input.note ?? null, inspectorId: input.inspectorId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(inspectionReports.id, rep.id));
    const to = rep.phase === 1 ? "insp1_passed" : "insp2_passed";
    const tr = await transitionOrder({ orderId, to, actor: "ops", note: `${rep.reportNo} 判定${input.verdict === "pass" ? "合格" : "让步接收"}` });
    if (!tr.ok) return { ok: false as const, error: "BAD_TRANSITION", from: tr.from, to: tr.to };
    if (o) void notifyBuyer(o.userId, `${phaseZh}已通过`, `订单 ${o.orderNo} ${rep.reportNo} 判定${input.verdict === "pass" ? "合格" : "让步接收"}，报告已可查看`, `/orders/${orderId}`);
    return { ok: true as const, status: "passed" as const };
  }
  if (input.verdict === "rework") {
    await db
      .update(inspectionReports)
      .set({ status: "rework", verdict: "rework", inspectorNote: input.note ?? null, inspectorId: input.inspectorId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(inspectionReports.id, rep.id));
    if (rep.phase === 1) {
      const tr = await transitionOrder({ orderId, to: "producing", actor: "ops", note: `${rep.reportNo} 判定返工：${input.note ?? ""}`.slice(0, 500) });
      if (!tr.ok) return { ok: false as const, error: "BAD_TRANSITION", from: tr.from, to: tr.to };
    } else {
      // 二检返工不回退状态，停 insp2_review 走异常处置（纯留痕）
      await logOrderEvent(orderId, "insp2_review", "ops", `${rep.reportNo} 二检判定返工，异常处置：${input.note ?? ""}`.slice(0, 500));
    }
    if (o) void notifyBuyer(o.userId, `${phaseZh}需返工`, `订单 ${o.orderNo} ${rep.reportNo} 判定返工，返工费用由工厂承担`, `/orders/${orderId}`);
    return { ok: true as const, status: "rework" as const };
  }
  // reject：报告拒收；订单不回退（一检停 insp1_review / 二检停 insp2_review），走异常处置
  await db
    .update(inspectionReports)
    .set({ status: "rejected", verdict: "reject", inspectorNote: input.note ?? null, inspectorId: input.inspectorId, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(inspectionReports.id, rep.id));
  await logOrderEvent(orderId, rep.phase === 1 ? "insp1_review" : "insp2_review", "ops", `${rep.reportNo} 判定不合格（拒收），异常处置中：${input.note ?? ""}`.slice(0, 500));
  if (o) void notifyBuyer(o.userId, `${phaseZh}未通过`, `订单 ${o.orderNo} ${rep.reportNo} 判定不合格，我们正在与工厂处置，将尽快同步方案`, `/orders/${orderId}`);
  return { ok: true as const, status: "rejected" as const };
}

// ─── 运营：返工后重新开放上传（订单 producing → goods_ready → insp1_uploading，令牌换新）───
export async function reopenUpload(reportId: number) {
  const db = await getDb();
  const rep = (await db.select().from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1))[0];
  if (!rep) return { ok: false as const, error: "NOT_FOUND" };
  if (rep.status !== "rework") return { ok: false as const, error: "BAD_STATE", status: rep.status };
  const orderId = Number(rep.orderId);
  const t1 = await transitionOrder({ orderId, to: "goods_ready", actor: "ops", note: `${rep.reportNo} 返工完成，重新报完工` });
  if (!t1.ok) return { ok: false as const, error: "BAD_TRANSITION", from: t1.from, to: t1.to };
  const t2 = await transitionOrder({ orderId, to: "insp1_uploading", actor: "ops", note: `${rep.reportNo} 重新开放证据上传` });
  if (!t2.ok) return { ok: false as const, error: "BAD_TRANSITION", from: t2.from, to: t2.to };
  const token = genToken();
  await db
    .update(inspectionReports)
    .set({ status: "uploading", uploadToken: token, tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS), updatedAt: new Date() })
    .where(eq(inspectionReports.id, rep.id));
  return { ok: true as const, token };
}

// ─── 运营：确认工厂盖章回传（触发 60% 货款节点）───
export async function markSigned(reportId: number) {
  const db = await getDb();
  const rep = (await db.select().from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1))[0];
  if (!rep) return { ok: false as const, error: "NOT_FOUND" };
  if (rep.status !== "passed") return { ok: false as const, error: "BAD_STATE", status: rep.status };
  const seal = await db
    .select({ id: inspectionEvidences.id, filePath: inspectionEvidences.filePath })
    .from(inspectionEvidences)
    .where(and(eq(inspectionEvidences.reportId, rep.id), eq(inspectionEvidences.itemCode, "factory_seal")))
    .orderBy(desc(inspectionEvidences.id))
    .limit(1);
  if (!seal[0]) return { ok: false as const, error: "NO_SEAL" };
  await db
    .update(inspectionReports)
    .set({ status: "signed", factorySignPath: seal[0].filePath, signedAt: new Date(), updatedAt: new Date() })
    .where(eq(inspectionReports.id, rep.id));
  return { ok: true as const };
}

// ─── 运营/仓库：二检实测重量体积（第二段账单出账依据，买家可见）───
export async function recordMeasurements(input: { reportId: number; weightKg: number; volumeCbm: number }) {
  const db = await getDb();
  const rep = (await db.select().from(inspectionReports).where(eq(inspectionReports.id, input.reportId)).limit(1))[0];
  if (!rep) return { ok: false as const, error: "NOT_FOUND" };
  if (rep.phase !== 2) return { ok: false as const, error: "PHASE2_ONLY" };
  await db
    .update(inspectionReports)
    .set({ measuredWeightKg: String(input.weightKg), measuredVolumeCbm: String(input.volumeCbm), updatedAt: new Date() })
    .where(eq(inspectionReports.id, rep.id));
  return { ok: true as const };
}

// ─── 运营工作台：报告列表（默认待判定优先）───
export async function listForOps(filter?: { status?: string }) {
  const db = await getDb();
  const rows = await db
    .select({
      id: inspectionReports.id,
      reportNo: inspectionReports.reportNo,
      orderId: inspectionReports.orderId,
      phase: inspectionReports.phase,
      template: inspectionReports.template,
      status: inspectionReports.status,
      verdict: inspectionReports.verdict,
      createdAt: inspectionReports.createdAt,
      updatedAt: inspectionReports.updatedAt,
      orderNo: orders.orderNo,
      productTitle: orders.productTitle,
      orderStatus: orders.status,
      quantity: orders.quantity,
    })
    .from(inspectionReports)
    .leftJoin(orders, eq(orders.id, inspectionReports.orderId))
    .orderBy(desc(inspectionReports.updatedAt))
    .limit(200);
  const filtered = filter?.status ? rows.filter((r) => r.status === filter.status) : rows;
  // 附带证据件数
  const out = [];
  for (const r of filtered) {
    out.push({ ...r, id: Number(r.id), orderId: Number(r.orderId), evidenceCounts: await evidenceCounts(Number(r.id)) });
  }
  return out;
}

// ─── 运营：可开一检/二检的订单列表（goods_ready / in_warehouse）───
export async function listActionableOrders() {
  const db = await getDb();
  const rows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      productTitle: orders.productTitle,
      quantity: orders.quantity,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(sql`${orders.status} IN ('goods_ready','in_warehouse','insp1_uploading','insp1_review','insp2_review','producing')`)
    .orderBy(desc(orders.updatedAt))
    .limit(200);
  // 附带各阶段报告状态
  const out = [];
  for (const o of rows) {
    const reps = await db
      .select({ id: inspectionReports.id, reportNo: inspectionReports.reportNo, phase: inspectionReports.phase, status: inspectionReports.status })
      .from(inspectionReports)
      .where(eq(inspectionReports.orderId, o.id))
      .orderBy(desc(inspectionReports.id));
    out.push({ ...o, id: Number(o.id), reports: reps.map((r) => ({ ...r, id: Number(r.id) })) });
  }
  return out;
}

// ─── 运营：报告详情（含全部证据清单）───
export async function getOpsDetail(reportId: number) {
  const db = await getDb();
  const rep = (await db.select().from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1))[0];
  if (!rep) return null;
  const o = (await db.select().from(orders).where(eq(orders.id, rep.orderId)).limit(1))[0];
  const ev = await db
    .select()
    .from(inspectionEvidences)
    .where(eq(inspectionEvidences.reportId, rep.id))
    .orderBy(inspectionEvidences.id);
  const tpl = getTemplate(rep.template);
  return {
    ...rep,
    id: Number(rep.id),
    orderId: Number(rep.orderId),
    inspectorId: rep.inspectorId ? Number(rep.inspectorId) : null,
    order: o ? { orderNo: o.orderNo, productTitle: o.productTitle, quantity: o.quantity, status: o.status, destination: o.destination } : null,
    template: tpl,
    evidences: ev.map((e) => ({ ...e, id: Number(e.id), reportId: Number(e.reportId) })),
  };
}

// ─── 买家侧：自己订单的质检报告（永不透 token；证据通过鉴权端点按 id 访问）───
export async function listForBuyer(orderId: number, userId: number) {
  const db = await getDb();
  const o = (await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1))[0];
  if (!o) return null;
  const reps = await db
    .select()
    .from(inspectionReports)
    .where(eq(inspectionReports.orderId, orderId))
    .orderBy(inspectionReports.phase, desc(inspectionReports.id));
  return reps.map((r) => ({
    id: Number(r.id),
    reportNo: r.reportNo,
    phase: r.phase,
    status: r.status,
    verdict: r.verdict,
    inspectorNote: r.inspectorNote,
    measuredWeightKg: r.measuredWeightKg ? Number(r.measuredWeightKg) : null,
    measuredVolumeCbm: r.measuredVolumeCbm ? Number(r.measuredVolumeCbm) : null,
    hasPdf: !!r.pdfPath || ["passed", "signed"].includes(r.status), // 判定后可生成
    templateName: getTemplate(r.template).nameEn,
    itemCount: getTemplate(r.template).items.length,
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
  }));
}

// ─── PDF/文件访问鉴权：三通道（ops / 订单买家本人 / 有效上传 token）───
export async function canAccessReport(input: { reportId: number; userId?: number | null; isOps?: boolean; token?: string | null }) {
  if (input.isOps) return { ok: true as const };
  const db = await getDb();
  const rep = (await db.select().from(inspectionReports).where(eq(inspectionReports.id, input.reportId)).limit(1))[0];
  if (!rep) return { ok: false as const };
  if (input.userId) {
    const o = (await db.select().from(orders).where(and(eq(orders.id, rep.orderId), eq(orders.userId, input.userId))).limit(1))[0];
    if (o) return { ok: true as const };
  }
  if (input.token && rep.uploadToken === input.token && (!rep.tokenExpiresAt || rep.tokenExpiresAt.getTime() > Date.now())) {
    return { ok: true as const };
  }
  return { ok: false as const };
}

// 标记 PDF 已生成（qcPdf 生成后回写路径）
export async function setPdfPath(reportId: number, pdfPath: string) {
  const db = await getDb();
  await db.update(inspectionReports).set({ pdfPath, updatedAt: new Date() }).where(eq(inspectionReports.id, reportId));
}

// 证据 → 报告归属查询（文件访问端点用）
export async function getEvidenceWithReport(evidenceId: number) {
  const db = await getDb();
  const ev = (await db.select().from(inspectionEvidences).where(eq(inspectionEvidences.id, evidenceId)).limit(1))[0];
  if (!ev) return null;
  const rep = (await db.select().from(inspectionReports).where(eq(inspectionReports.id, ev.reportId)).limit(1))[0];
  return rep ? { evidence: { ...ev, id: Number(ev.id) }, report: { ...rep, id: Number(rep.id), orderId: Number(rep.orderId) } } : null;
}
