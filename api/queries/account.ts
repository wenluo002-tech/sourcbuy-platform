// M4a 买家后台查询层：收货地址簿 + 消息中心 + 工作台汇总
// 纪律：全部按 userId 隔离（越权返回空/null，不报存在性）；新增地址默认第一个自动设默认
import { eq, desc, and, isNull, sql as dsql } from "drizzle-orm";
import { getDb } from "./connection";
import { addresses, notifications, orders, chatThreads } from "../../db/schema";

// ---------- 地址簿 ----------
export async function listAddresses(userId: number) {
  const db = await getDb();
  return db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.updatedAt));
}

export async function createAddress(
  userId: number,
  input: {
    label?: string; contactName: string; phone: string; country: string;
    state?: string; city?: string; address1: string; address2?: string; postcode?: string;
  }
) {
  const db = await getDb();
  const existing = await db.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, userId));
  const r = await db.insert(addresses).values({
    userId,
    label: input.label?.slice(0, 64) || null,
    contactName: input.contactName.slice(0, 128),
    phone: input.phone.slice(0, 64),
    country: input.country.slice(0, 64),
    state: input.state?.slice(0, 128) || null,
    city: input.city?.slice(0, 128) || null,
    address1: input.address1.slice(0, 255),
    address2: input.address2?.slice(0, 255) || null,
    postcode: input.postcode?.slice(0, 32) || null,
    isDefault: existing.length === 0, // 第一个地址自动设默认
  });
  return { id: Number(r[0].insertId) };
}

export async function updateAddress(userId: number, id: number, input: Record<string, string | undefined>) {
  const db = await getDb();
  const sets: Record<string, string | null> = {};
  for (const k of ["label", "contactName", "phone", "country", "state", "city", "address1", "address2", "postcode"] as const) {
    if (input[k] !== undefined) sets[k] = input[k]!.slice(0, 255) || null;
  }
  if (!Object.keys(sets).length) return { ok: false };
  const r = await db.update(addresses).set(sets).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  return { ok: (r[0] as any).affectedRows > 0 };
}

export async function removeAddress(userId: number, id: number) {
  const db = await getDb();
  const r = await db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  return { ok: (r[0] as any).affectedRows > 0 };
}

export async function setDefaultAddress(userId: number, id: number) {
  const db = await getDb();
  // 先清后设，两次单表单行更新（无事务也能容忍中间态——最坏结果是没有默认地址）
  await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
  const r = await db.update(addresses).set({ isDefault: true }).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  return { ok: (r[0] as any).affectedRows > 0 };
}

// ---------- 消息中心 ----------
export async function listNotifications(userId: number) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
}

export async function unreadCount(userId: number): Promise<number> {
  const db = await getDb();
  const [r]: any = await db.execute(
    dsql`SELECT COUNT(*) AS n FROM notifications WHERE user_id=${userId} AND read_at IS NULL`
  );
  return Number(r[0]?.c ?? r[0]?.["COUNT(*)"] ?? 0);
}

export async function markRead(userId: number, id: number) {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { ok: true };
}

export async function markAllRead(userId: number) {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { ok: true };
}

// 内部发消息（订单流转、系统广播用；别的模块 import 这个）
export async function pushNotification(userId: number, type: string, title: string, body?: string, link?: string) {
  const db = await getDb();
  await db.insert(notifications).values({ userId, type, title: title.slice(0, 255), body: body ?? null, link: link ?? null });
}

// ---------- 工作台汇总 ----------
export async function dashboardSummary(userId: number) {
  const db = await getDb();
  const [activeOrders, totalOrders, threadCount, unread] = await Promise.all([
    db.select({ id: orders.id, orderNo: orders.orderNo, status: orders.status, productTitle: orders.productTitle, productImage: orders.productImage, quantity: orders.quantity, destination: orders.destination, updatedAt: orders.updatedAt })
      .from(orders)
      .where(and(eq(orders.userId, userId), dsql`status NOT IN ('received','cancelled')`))
      .orderBy(desc(orders.updatedAt))
      .limit(5),
    db.select({ n: dsql<number>`COUNT(*)` }).from(orders).where(eq(orders.userId, userId)),
    db.select({ n: dsql<number>`COUNT(*)` }).from(chatThreads).where(eq(chatThreads.userId, userId)),
    unreadCount(userId),
  ]);
  // 待办：已报价值待确认 + 待付款
  const todos = activeOrders.filter((o) => o.status === "quoted" || o.status === "pending_payment");
  return {
    activeOrders,
    todos,
    stats: {
      totalOrders: Number(totalOrders[0]?.n ?? 0),
      activeCount: activeOrders.length,
      inquiries: Number(threadCount[0]?.n ?? 0),
      unread,
    },
  };
}
