// M3b 订单查询层：发起询价 / 我的订单 / 订单详情 / 买家流转（确认报价、确认收货、取消）
import { eq, desc, and } from "drizzle-orm";
import { getDb } from "./connection";
import { orders, orderEvents } from "../../db/schema";
import { NEXT_ALLOWED, type OrderStatus, type OrderQuote } from "../../contracts/orderFlow";

function genOrderNo(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SB${ymd}-${rand}`;
}

async function addEvent(orderId: number, from: string | null, to: string, actor: "buyer" | "ops" | "system", note?: string) {
  const db = await getDb();
  await db.insert(orderEvents).values({ orderId, fromStatus: from, toStatus: to, actor, note: note ?? null });
}

// 纯留痕（状态不变）：异常处置等"不改变状态但必须可回放"的场景用，如二检不合格停在 insp2_review
export async function logOrderEvent(orderId: number, status: string, actor: "buyer" | "ops" | "system", note: string) {
  await addEvent(orderId, status, status, actor, note);
}

// 发起询价：必须登录（询价即建档，订单跟着账号走）；商品快照 + 买家原话都留底
export async function createInquiry(input: {
  userId: number;
  threadId?: number;
  offerId?: string;
  productTitle?: string;
  productImage?: string;
  quantity?: number;
  destination?: string;
  demand?: string;
}) {
  const db = await getDb();
  const orderNo = genOrderNo();
  const r = await db.insert(orders).values({
    orderNo,
    userId: input.userId,
    threadId: input.threadId ?? null,
    offerId: input.offerId ?? null,
    productTitle: input.productTitle?.slice(0, 500) ?? null,
    productImage: input.productImage ?? null,
    quantity: input.quantity ?? null,
    destination: input.destination?.slice(0, 120) ?? null,
    demand: input.demand?.slice(0, 5000) ?? null,
    status: "inquiry",
  });
  const orderId = Number(r[0].insertId);
  await addEvent(orderId, null, "inquiry", "buyer", input.demand?.slice(0, 500));
  return { orderId, orderNo };
}

export async function listMyOrders(userId: number) {
  const db = await getDb();
  return db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      productTitle: orders.productTitle,
      productImage: orders.productImage,
      quantity: orders.quantity,
      destination: orders.destination,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.updatedAt));
}

// 详情：归属校验——越权返回 null（不暴露订单是否存在）
export async function getOrderDetail(orderId: number, userId: number) {
  const db = await getDb();
  const rows = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1);
  if (!rows[0]) return null;
  const events = await db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(orderEvents.id);
  return { ...rows[0], events };
}

// 状态流转（买家侧 + 运营 CLI 共用）：不在流转表里的一律拒绝，报价只在 inquiry→quoted 时写入
export async function transitionOrder(input: {
  orderId: number;
  to: OrderStatus;
  actor: "buyer" | "ops" | "system";
  note?: string;
  quote?: OrderQuote;
  userId?: number; // 买家侧必传，用于归属校验
  decisionTags?: string[]; // 确认报价时的选择理由（价格/交期/样品/验厂/沟通/其他）
  decisionNote?: string; // 选择理由可选补充
}) {
  const db = await getDb();
  const rows = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  const o = rows[0];
  if (!o) return { ok: false as const, error: "NOT_FOUND" };
  if (input.actor === "buyer" && o.userId !== input.userId) return { ok: false as const, error: "NOT_FOUND" };
  const from = o.status as OrderStatus;
  if (!NEXT_ALLOWED[from].includes(input.to)) return { ok: false as const, error: "BAD_TRANSITION", from, to: input.to };
  // 买家只许三种动作：确认报价、确认收货、未付款前取消
  if (input.actor === "buyer") {
    const allowed =
      (from === "quoted" && input.to === "pending_payment") ||
      (from === "dispatched" && input.to === "received") ||
      (input.to === "cancelled" && (from === "inquiry" || from === "quoted" || from === "pending_payment"));
    if (!allowed) return { ok: false as const, error: "BAD_TRANSITION", from, to: input.to };
  }
  await db
    .update(orders)
    .set({
      status: input.to,
      updatedAt: new Date(),
      ...(input.quote ? { quote: input.quote as any } : {}),
      // 买家确认报价时落选择理由（决策上下文核心资产；只在 quoted→pending_payment 这一跳写）
      ...(input.decisionTags?.length || input.decisionNote
        ? { decisionTags: (input.decisionTags ?? []) as any, decisionNote: input.decisionNote ?? null }
        : {}),
    })
    .where(eq(orders.id, input.orderId));
  await addEvent(input.orderId, from, input.to, input.actor, input.note);
  return { ok: true as const, from, to: input.to };
}
