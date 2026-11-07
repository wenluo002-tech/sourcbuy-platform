// ═══ 权益锁（2026-11-07 罗总授权）：首单付款后解锁完整工厂档案 ═══
// 未解锁访客：厂名→确定性代号「严选工厂 No.XXXX」，memberId/home/sellerUserId 等可反查身份的字段一律抽空；
// 地区/分层/评分/年限照常展示（不构成身份泄露，且是买家筛选所需）。
// 解锁判定：存在已付款订单（状态进入 sourcing 及以后；pending_payment 是未付款，不解锁）。
// 纪律：mask 只做减法（替换/抽空），绝不编造字段；代号由 id 确定性生成，同一厂永远同一代号。
import { getDb } from "../queries/connection";
import { sql } from "drizzle-orm";

export async function isUnlockedBuyer(userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const db = getDb();
    // 已付款状态：pending_payment 之后的四态（inquiry/quoted/pending_payment 都未付款，不解锁）
    const [r]: any = await db.execute(
      sql`SELECT 1 FROM orders WHERE user_id = ${userId} AND status IN ('sourcing','inspecting','shipped','received') LIMIT 1`
    );
    return Array.isArray(r) && r.length > 0;
  } catch {
    return false; // 解锁判定挂了按未解锁处理，不挡公共接口
  }
}

export function maskedFactoryName(id: number | string | bigint): string {
  const n = Number(id);
  return `严选工厂 No.${String(Number.isFinite(n) ? n : 0).padStart(4, "0")}`;
}

type AnyFactory = Record<string, any> & { id?: number | bigint; name?: string | null };

/** 工厂行遮罩：未解锁时厂名换代号、身份字段抽空、masked=true（前端据此显示解锁提示） */
export function maskFactory<T extends AnyFactory>(f: T, unlocked: boolean): T & { masked: boolean };
export function maskFactory<T extends AnyFactory>(f: T | null | undefined, unlocked: boolean): (T & { masked: boolean }) | null;
export function maskFactory(f: any, unlocked: boolean): any {
  if (!f) return null;
  if (unlocked) return { ...f, masked: false };
  return {
    ...f,
    name: maskedFactoryName(f.id ?? 0),
    memberId: null,
    member_id: null,
    sellerUserId: null,
    seller_user_id: null,
    home: null,
    masked: true,
  };
}

/** 商品/报价遮罩：上游店铺名与卖家身份键未解锁一律抽空（shopName/sellerName/memberId/sellerLoginId） */
export function maskOffer<T extends Record<string, any>>(o: T | null | undefined, unlocked: boolean): T | null {
  if (!o) return null;
  if (unlocked) return o;
  const out = { ...o };
  for (const k of ["shopName", "sellerName", "memberId", "sellerLoginId", "sellerUserId"]) {
    if (k in out) (out as any)[k] = null;
  }
  return out;
}
