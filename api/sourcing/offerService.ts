// 货源服务层：同一商品永不重复花钱
// getOfferDetail 链路：MySQL 缓存(24h) → 万邦 item_get_app(0.05) → 点金 1688xq3(0.28,纯灾备) → 旧聚合 API
// searchOffers 链路：搜索缓存(30min 防刷) → 万邦 item_search(0.022)
// 每一笔真实调用都落 sourcingApiLogs（万邦下架/无效也计费，必须可审计）
import { eq, and, desc, gt } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { offers, offerSearchCache, sourcingApiLogs, factories } from "@db/schema";
import { wbGetOfferApp, wbSearchItems, WANBANG_COST } from "./wanbang";
import { djGetOffer, DIANJIN_COST } from "./dianjin";
import { fetchOffer } from "../queries/products";
import type { OfferDetail, OfferSearchResult } from "../../contracts/offer";

const OFFER_TTL_MS = 24 * 3600 * 1000; // 详情缓存 24h
const SEARCH_TTL_MS = 30 * 60 * 1000; // 搜索缓存 30min

async function logApi(e: {
  provider: string;
  endpoint: string;
  offerId?: string;
  query?: string;
  costCny: number;
  billed: boolean;
  ok: boolean;
  durationMs: number;
  error?: string;
}) {
  try {
    await getDb().insert(sourcingApiLogs).values({
      provider: e.provider,
      endpoint: e.endpoint,
      offerId: e.offerId ?? null,
      query: e.query ?? null,
      costCny: String(e.costCny),
      billed: e.billed,
      ok: e.ok,
      durationMs: e.durationMs,
      error: e.error?.slice(0, 250) ?? null,
    });
  } catch {
    /* 台账失败不阻断主流程 */
  }
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToDetail(r: typeof offers.$inferSelect): OfferDetail {
  return {
    offerId: r.offerId,
    title: r.title,
    images: r.images ?? [],
    priceTiers: r.priceTiers ?? [],
    priceMin: num(r.priceMin),
    priceMax: num(r.priceMax),
    moq: r.moq,
    skus: r.skus ?? [],
    sales: r.sales,
    unitWeightKg: num(r.unitWeightKg),
    sellerName: r.sellerName,
    memberId: r.memberId,
    dispatchHours: r.dispatchHours,
    dispatchNote: r.dispatchNote,
    source: "cache",
    fetchedAt: r.fetchedAt.toISOString(),
  };
}

async function joinFactory(memberId: string | null) {
  if (!memberId) return null;
  const rows = await getDb()
    .select({
      id: factories.id,
      name: factories.name,
      tier: factories.tier,
      score: factories.score,
      years: factories.years,
      location: factories.location,
      cert: factories.cert,
    })
    .from(factories)
    .where(eq(factories.memberId, memberId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertOffer(d: OfferDetail) {
  const db = getDb();
  const values = {
    title: d.title.slice(0, 500),
    images: d.images,
    priceMin: d.priceMin != null ? String(d.priceMin) : null,
    priceMax: d.priceMax != null ? String(d.priceMax) : null,
    priceTiers: d.priceTiers,
    moq: d.moq,
    sales: d.sales,
    skus: d.skus,
    sellerName: d.sellerName?.slice(0, 250) ?? null,
    memberId: d.memberId,
    dispatchHours: d.dispatchHours,
    dispatchNote: d.dispatchNote?.slice(0, 250) ?? null,
    unitWeightKg: d.unitWeightKg != null ? String(d.unitWeightKg) : null,
    source: d.source === "cache" ? "legacy" : d.source,
    status: "active" as const,
    fetchedAt: new Date(),
  };
  await db
    .insert(offers)
    .values({ offerId: d.offerId, ...values })
    .onDuplicateKeyUpdate({ set: values });
}

export async function getOfferDetail(offerId: string) {
  // 无效 ID 直接拦截——万邦对不存在的商品也照扣 0.05，绝不能白烧
  if (!/^\d{6,20}$/.test(offerId)) return { offer: null, factory: null };
  const db = getDb();

  // 1. 缓存命中（24h 内）→ 零成本
  const cached = await db.select().from(offers).where(eq(offers.offerId, offerId)).limit(1);
  const row = cached[0];
  if (row && row.status !== "delisted" && Date.now() - row.fetchedAt.getTime() < OFFER_TTL_MS) {
    return { offer: rowToDetail(row), factory: await joinFactory(row.memberId) };
  }

  // 2. 万邦（主力）
  let detail: OfferDetail | null = null;
  let t0 = Date.now();
  try {
    const r = await wbGetOfferApp(offerId);
    await logApi({ provider: "wanbang", endpoint: "item_get_app", offerId, costCny: r.billed ? WANBANG_COST.item_get_app : 0, billed: r.billed, ok: !!r.offer, durationMs: Date.now() - t0, error: r.offer ? undefined : "商品不存在或已下架" });
    detail = r.offer;
    if (!detail && row) {
      // 万邦确认下架：标记并仍返回过期缓存（页面顶部提示），不反复烧钱复查
      await db.update(offers).set({ status: "delisted", fetchedAt: new Date() }).where(eq(offers.offerId, offerId));
      return { offer: { ...rowToDetail(row) }, factory: await joinFactory(row.memberId), delisted: true };
    }
  } catch (e: any) {
    await logApi({ provider: "wanbang", endpoint: "item_get_app", offerId, costCny: 0, billed: false, ok: false, durationMs: Date.now() - t0, error: e?.message ?? "unknown" });
  }

  // 3. 点金（纯灾备）
  if (!detail) {
    t0 = Date.now();
    try {
      detail = await djGetOffer(offerId);
      await logApi({ provider: "dianjin", endpoint: "1688xq3", offerId, costCny: detail ? DIANJIN_COST : 0, billed: !!detail, ok: !!detail, durationMs: Date.now() - t0, error: detail ? undefined : "no data" });
    } catch (e: any) {
      await logApi({ provider: "dianjin", endpoint: "1688xq3", offerId, costCny: 0, billed: false, ok: false, durationMs: Date.now() - t0, error: e?.message ?? "unknown" });
    }
  }

  // 4. 旧聚合 API（最后的底裤，字段不全但免费）
  if (!detail) {
    try {
      const o = await fetchOffer(offerId);
      if (o) {
        detail = {
          offerId: o.offerId,
          title: o.title,
          images: o.images ?? [],
          priceTiers: (o.priceTiers ?? []).map((p: any) => ({ minQty: Number(p.minQty ?? p.beginAmount ?? 0), price: Number(p.price ?? 0) })),
          priceMin: num((o as any).priceMin),
          priceMax: num((o as any).priceMax),
          moq: num((o as any).moq),
          skus: [],
          sales: num((o as any).amountOnSale),
          unitWeightKg: null,
          sellerName: o.shopName ?? null,
          memberId: o.memberId ?? null,
          dispatchHours: null,
          dispatchNote: null,
          source: "legacy",
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch {
      /* 三级都失败 */
    }
  }

  if (!detail) {
    // 上游全挂但有过期缓存：兜底返回，页面顶部提示数据可能过时
    if (row) return { offer: rowToDetail(row), factory: await joinFactory(row.memberId), stale: true };
    return { offer: null, factory: null };
  }

  await upsertOffer(detail);
  return { offer: detail, factory: await joinFactory(detail.memberId) };
}

export async function searchOffers(query: string, page = 1): Promise<OfferSearchResult> {
  const q = query.trim();
  if (!q) return { items: [], total: null, page, source: "cache" };
  const db = getDb();

  // 30 分钟内同词同页不重查
  const cached = await db
    .select()
    .from(offerSearchCache)
    .where(and(eq(offerSearchCache.query, q), eq(offerSearchCache.page, page), gt(offerSearchCache.createdAt, new Date(Date.now() - SEARCH_TTL_MS))))
    .orderBy(desc(offerSearchCache.createdAt))
    .limit(1);
  if (cached[0]?.items) {
    return { items: cached[0].items, total: cached[0].total, page, source: "cache" };
  }

  const t0 = Date.now();
  try {
    const r = await wbSearchItems(q, page);
    await logApi({ provider: "wanbang", endpoint: "item_search", query: q, costCny: r.billed ? WANBANG_COST.item_search : 0, billed: r.billed, ok: true, durationMs: Date.now() - t0 });
    await db.insert(offerSearchCache).values({ query: q, page, total: r.total, items: r.items, source: "wanbang" }).catch(() => {});
    return { items: r.items, total: r.total, page, source: "wanbang" };
  } catch (e: any) {
    await logApi({ provider: "wanbang", endpoint: "item_search", query: q, costCny: 0, billed: false, ok: false, durationMs: Date.now() - t0, error: e?.message ?? "unknown" });
    // 万邦挂了：有旧缓存就给旧缓存，不给买家看白屏
    const stale = await db
      .select()
      .from(offerSearchCache)
      .where(and(eq(offerSearchCache.query, q), eq(offerSearchCache.page, page)))
      .orderBy(desc(offerSearchCache.createdAt))
      .limit(1);
    if (stale[0]?.items) return { items: stale[0].items, total: stale[0].total, page, source: "cache" };
    throw e;
  }
}
