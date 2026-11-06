// 货源服务层：同一商品永不重复花钱
// getOfferDetail 链路：MySQL 缓存(24h) → 万邦 item_get_app(0.05) → 点金 1688xq3(0.28,纯灾备) → 旧聚合 API
// searchOffers 链路：30min 防刷缓存 → 产品池(长期,零成本) → 万邦 item_search(0.022,结果回填产品池)
// 每一笔真实调用都落 sourcingApiLogs（万邦下架/无效也计费，必须可审计）
import { eq, and, desc, gt, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { offers, offerSearchCache, offerPool, sourcingApiLogs, factories } from "@db/schema";
import { wbGetOfferApp, wbSearchItems, WANBANG_COST } from "./wanbang";
import { djGetOffer, DIANJIN_COST } from "./dianjin";
import { fetchOffer } from "../queries/products";
import { expandQuery, LEXICON } from "../../contracts/lexicon";
import type { OfferDetail, OfferSearchItem, OfferSearchResult } from "../../contracts/offer";

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
    sellerLoginId: r.sellerLoginId ?? null,
    dispatchHours: r.dispatchHours,
    dispatchNote: r.dispatchNote,
    specImages: r.specImages ?? {},
    source: "cache",
    fetchedAt: r.fetchedAt.toISOString(),
  };
}

// 三键 join：严选库 81% 用 b2b-xxx 会员 ID、19% 用老登录名；
// 另有图片 CDN 提取的卖家 userId —— member_id 以 'b2b-{userId}' 为前缀（常量前缀 LIKE 走 uq_factories_member 索引）
async function joinFactory(memberId: string | null, sellerLoginId?: string | null, sellerUserId?: string | null) {
  const keys = [...new Set([memberId, sellerLoginId].filter((k): k is string => !!k))];
  const conds: ReturnType<typeof sql>[] = [];
  if (keys.length) conds.push(sql`${factories.memberId} IN (${sql.join(keys.map((k) => sql`${k}`), sql`,`)})`);
  if (sellerUserId) conds.push(sql`${factories.memberId} LIKE ${`b2b-${sellerUserId}%`}`);
  if (!conds.length) return null;
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
    .where(sql`(${sql.join(conds, sql` OR `)})`)
    .limit(1);
  return rows[0] ?? null;
}

// 批量三键匹配：一组池子行 → 命中的严选厂（userId 前缀全部常量化，走索引）
async function joinFactoriesBatch(rows: { offerId: string; memberId: string | null; sellerLoginId: string | null; sellerUserId: string | null }[]) {
  const keys = new Set<string>();
  const uids = new Set<string>();
  for (const r of rows) {
    if (r.memberId) keys.add(r.memberId);
    if (r.sellerLoginId) keys.add(r.sellerLoginId);
    if (r.sellerUserId) uids.add(r.sellerUserId);
  }
  const conds: ReturnType<typeof sql>[] = [];
  if (keys.size) conds.push(sql`${factories.memberId} IN (${sql.join([...keys].map((k) => sql`${k}`), sql`,`)})`);
  for (const u of uids) conds.push(sql`${factories.memberId} LIKE ${`b2b-${u}%`}`);
  const hitByOffer = new Map<string, { id: number; name: string; tier: string | null; score: string | null; years: string | null; location: string | null; cert: string | null }>();
  if (!conds.length) return hitByOffer;
  const frows = await getDb()
    .select({ id: factories.id, name: factories.name, tier: factories.tier, score: factories.score, years: factories.years, location: factories.location, cert: factories.cert, memberId: factories.memberId })
    .from(factories)
    .where(sql`(${sql.join(conds, sql` OR `)}) AND ${factories.isTrader} = 0 AND ${factories.dupOf} IS NULL`);
  const byMember = new Map(frows.map((f) => [f.memberId, f]));
  for (const r of rows) {
    const f =
      (r.memberId && byMember.get(r.memberId)) ||
      (r.sellerLoginId && byMember.get(r.sellerLoginId)) ||
      (r.sellerUserId && frows.find((x) => x.memberId.startsWith(`b2b-${r.sellerUserId}`))) ||
      null;
    if (f) hitByOffer.set(r.offerId, f);
  }
  return hitByOffer;
}

// 详情接口没有平台总销量时，从搜索缓存里捞回该商品的搜索级销量（本地查询，零成本）
async function salesFromSearchCache(offerId: string): Promise<number | null> {
  try {
    const rows = await getDb()
      .select({ items: offerSearchCache.items })
      .from(offerSearchCache)
      .where(sql`JSON_SEARCH(${offerSearchCache.items}, 'one', ${offerId}, NULL, '$[*].offerId') IS NOT NULL`)
      .orderBy(desc(offerSearchCache.createdAt))
      .limit(5);
    let best: number | null = null;
    for (const r of rows) {
      const hit = (r.items ?? []).find((i) => i.offerId === offerId);
      if (hit && hit.sales > 0) best = Math.max(best ?? 0, hit.sales);
    }
    return best;
  } catch {
    return null;
  }
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
    sellerLoginId: d.sellerLoginId ?? null,
    dispatchHours: d.dispatchHours,
    dispatchNote: d.dispatchNote?.slice(0, 250) ?? null,
    unitWeightKg: d.unitWeightKg != null ? String(d.unitWeightKg) : null,
    specImages: d.specImages ?? {},
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
  const finish = async (o: OfferDetail, extra?: Record<string, unknown>) => {
    if (o.sales == null) o.sales = await salesFromSearchCache(offerId);
    return { offer: o, factory: await joinFactory(o.memberId, o.sellerLoginId), ...extra };
  };

  // 1. 缓存命中（24h 内）→ 零成本
  const cached = await db.select().from(offers).where(eq(offers.offerId, offerId)).limit(1);
  const row = cached[0];
  if (row && row.status !== "delisted" && Date.now() - row.fetchedAt.getTime() < OFFER_TTL_MS) {
    return finish(rowToDetail(row));
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
      return finish(rowToDetail(row), { delisted: true });
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
          sellerLoginId: null,
          dispatchHours: null,
          dispatchNote: null,
          specImages: {},
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
    if (row) return finish(rowToDetail(row), { stale: true });
    return { offer: null, factory: null };
  }

  await upsertOffer(detail);
  return finish(detail);
}

// ============ 产品池（v48）：长期货源资产 + 以货带厂 ============
// 搜索缓存(30min)只是防刷层；产品池把每次真实搜索的在售货源逐条沉淀，跨查询复用。
// 价值一：命中池 = 零成本秒回，数据越攒越厚（滚雪球）。
// 价值二：池里的货拉过详情就有 memberId → join 严选库，"这家厂就在卖这款"是最硬推荐证据。

// 入池过滤：无销量/无价格/价格离谱（运费链接、占位价）的不进池——池子只装能给买家看的货
function poolWorthy(it: OfferSearchItem): boolean {
  const price = it.promotionPrice ?? it.price;
  return !!it.offerId && !!it.title && it.sales > 0 && price > 0.01 && price < 50000;
}

// 图片 CDN URL 内嵌卖家 userId（"!!{userId}"），零成本提取——
// 严选库 81% 的 member_id 是 b2b-{userId}{hex} 格式，前缀 LIKE 即可挂接，不用花钱拉详情。
// 461168 开头是阿里图床内部 id，不是卖家 userId，排除。
function userIdFromImage(image: string | null): string | null {
  if (!image) return null;
  const m = image.match(/!!(\d{6,})/);
  return m && !m[1].startsWith("461168") ? m[1] : null;
}

async function ingestPool(items: OfferSearchItem[]) {
  const db = getDb();
  for (const it of items) {
    if (!poolWorthy(it)) continue;
    const uid = userIdFromImage(it.image);
    try {
      await db
        .insert(offerPool)
        .values({
          offerId: it.offerId,
          title: it.title.slice(0, 500),
          image: it.image,
          price: String(it.price),
          promotionPrice: it.promotionPrice != null ? String(it.promotionPrice) : null,
          sales: it.sales,
          sellerUserId: uid,
        })
        .onDuplicateKeyUpdate({
          set: {
            title: it.title.slice(0, 500),
            image: it.image,
            price: String(it.price),
            promotionPrice: it.promotionPrice != null ? String(it.promotionPrice) : null,
            sales: sql`GREATEST(sales, ${it.sales})`, // 销量只增不减，保住历史峰值
            sellerUserId: uid ?? undefined, // 新图没有 userId 时不覆盖旧值
            hitCount: sql`hit_count + 1`,
            lastSeenAt: new Date(),
          },
        });
    } catch {
      /* 单条入池失败不影响整体 */
    }
  }
}

// 池内检索：query 本身 + query 里命中的词库产品词（"植绒防滑衣架50个装"→"衣架"）做标题子串匹配
// 命中条件同时要求销量>0、价格正常——池里混不进运费链接
// 池内检索（导出：aiSourcing 以货带厂也用它取候选——严选厂货排前）
export async function poolSearch(query: string, limit = 8): Promise<OfferSearchItem[]> {
  const terms = new Set<string>();
  const q = query.trim();
  if (q.length >= 2 && q.length <= 30 && !/\s/.test(q)) terms.add(q);
  const { category } = expandQuery(q);
  if (category && LEXICON[category]) {
    for (const p of LEXICON[category].products) {
      if (p.length >= 2 && q.includes(p)) terms.add(p);
    }
  }
  if (!terms.size) return [];
  const likeConds = [...terms].map((t) => sql`${offerPool.title} LIKE ${"%" + t + "%"}`);
  // 阶段一：纯池查询（title 子串 + 质量过滤），按销量取候选
  const rows = await getDb()
    .select()
    .from(offerPool)
    .where(
      and(
        sql`(${sql.join(likeConds, sql` OR `)})`,
        gt(offerPool.sales, 0),
        sql`COALESCE(${offerPool.promotionPrice}, ${offerPool.price}) > 0.01`,
        sql`COALESCE(${offerPool.promotionPrice}, ${offerPool.price}) < 50000`,
      ),
    )
    .orderBy(desc(offerPool.sales), desc(offerPool.lastSeenAt))
    .limit(Math.max(limit * 3, 24)); // 多取候选，给严选厂货留排前空间
  if (!rows.length) return [];
  // 阶段二：批量三键匹配严选厂，命中的货排最前——商品墙前几位就是"严选库在册"的货
  const hits = await joinFactoriesBatch(
    rows.map((r) => ({ offerId: r.offerId, memberId: r.memberId, sellerLoginId: r.sellerLoginId, sellerUserId: r.sellerUserId })),
  );
  const sorted = [...rows].sort((a, b) => Number(hits.has(b.offerId)) - Number(hits.has(a.offerId)));
  return sorted.slice(0, limit).map((r) => ({
    offerId: r.offerId,
    title: r.title,
    image: r.image,
    price: Number(r.price ?? 0),
    promotionPrice: r.promotionPrice != null ? Number(r.promotionPrice) : null,
    sales: r.sales,
  }));
}

export interface LinkedOfferFactory {
  offerId: string;
  title: string;
  image: string | null;
  price: number;
  sales: number;
  factory: { id: number; name: string; tier: string | null; score: number | string | null; years: string | null; location: string | null; cert: string | null };
}

// 以货带厂：对搜到的 top 货源拉详情拿 memberId，join 严选库。
// 命中 = "这家严选厂就在卖这款货"（最硬证据，话术和卡片都给金标）。
// 成本控制：只取销量 top N；详情走 getOfferDetail 的 24h 缓存，同货 24h 内零成本；
// memberId 回写产品池，下次同款货连详情都不用拉。
export async function linkTopOffersToFactories(items: OfferSearchItem[], limit = 3): Promise<LinkedOfferFactory[]> {
  // 候选取前 20：调用方负责排序（poolSearch 严选厂优先 / 搜索结果销量序）。
  // 不看全量只看 top 3 几乎永远 miss（严选库 4,060 家 vs 全平台数百万卖家）
  const candidates = items
    .filter((i) => i.sales > 0 && /^\d{6,20}$/.test(i.offerId))
    .slice(0, 20);
  if (!candidates.length) return [];
  const db = getDb();

  // 快速通道：产品池里已有卖家身份（memberId / loginId / 图片提取的 userId）的，批量三键匹配，零成本
  const poolRows = await db
    .select()
    .from(offerPool)
    .where(sql`${offerPool.offerId} IN (${sql.join(candidates.map((t) => sql`${t.offerId}`), sql`,`)})`);
  const poolMap = new Map(poolRows.map((r) => [r.offerId, r]));
  const hits = await joinFactoriesBatch(
    poolRows
      .filter((r) => r.memberId || r.sellerLoginId || r.sellerUserId)
      .map((r) => ({ offerId: r.offerId, memberId: r.memberId, sellerLoginId: r.sellerLoginId, sellerUserId: r.sellerUserId })),
  );

  const out: LinkedOfferFactory[] = [];
  const seenFactory = new Set<number>(); // 同一家厂只占一个坑，多款货不重复推荐
  const needDetail: OfferSearchItem[] = [];
  for (const it of candidates) {
    if (out.length >= limit) break;
    const f = hits.get(it.offerId);
    if (f) {
      if (!seenFactory.has(f.id)) {
        seenFactory.add(f.id);
        out.push({ offerId: it.offerId, title: it.title, image: it.image, price: it.promotionPrice ?? it.price, sales: it.sales, factory: f });
      }
      continue;
    }
    const p = poolMap.get(it.offerId);
    // 已有 userId 但没匹配上 = 确认不在严选库，不必再花钱拉详情复核
    if (p?.sellerUserId) continue;
    needDetail.push(it);
  }
  // 快速通道已凑够，不再花钱拉详情
  if (out.length >= limit) return out;
  const top = needDetail.slice(0, limit - out.length);

  // 慢速通道：拉详情（24h 缓存内零成本，否则万邦 0.05/条，只补差额）
  const settled = await Promise.allSettled(
    top.map(async (it) => {
      const { offer, factory } = await getOfferDetail(it.offerId);
      if (offer?.memberId || offer?.sellerLoginId) {
        // 卖家身份三键回写产品池（含详情图提取的 userId）——下次以货带厂零成本
        const uid = userIdFromImage(offer.images?.[0] ?? null);
        await db
          .update(offerPool)
          .set({
            memberId: offer.memberId,
            sellerLoginId: offer.sellerLoginId,
            ...(uid ? { sellerUserId: uid } : {}),
            detailFetchedAt: new Date(),
          })
          .where(eq(offerPool.offerId, it.offerId))
          .catch(() => {});
      }
      return factory ? { offerId: it.offerId, title: it.title, image: it.image, price: it.promotionPrice ?? it.price, sales: it.sales, factory } : null;
    }),
  );
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value && !seenFactory.has(r.value.factory.id)) {
      seenFactory.add(r.value.factory.id);
      out.push(r.value);
    }
  }
  return out;
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

  // 产品池：长期资产，第一页命中 ≥6 条直接零成本秒回（跨查询复用，滚雪球）
  if (page === 1) {
    try {
      const pooled = await poolSearch(q, 8);
      if (pooled.length >= 6) {
        return { items: pooled, total: null, page, source: "cache" };
      }
    } catch {
      /* 池查询失败不阻塞，继续走实时搜索 */
    }
  }

  const t0 = Date.now();
  try {
    const r = await wbSearchItems(q, page);
    await logApi({ provider: "wanbang", endpoint: "item_search", query: q, costCny: r.billed ? WANBANG_COST.item_search : 0, billed: r.billed, ok: true, durationMs: Date.now() - t0 });
    await db.insert(offerSearchCache).values({ query: q, page, total: r.total, items: r.items, source: "wanbang" }).catch(() => {});
    await ingestPool(r.items).catch(() => {}); // 每次真实搜索都沉淀进产品池
    return { items: r.items, total: r.total, page, source: "wanbang" };
  } catch (e: any) {
    await logApi({ provider: "wanbang", endpoint: "item_search", query: q, costCny: 0, billed: false, ok: false, durationMs: Date.now() - t0, error: e?.message ?? "unknown" });
    // 万邦挂了：先给产品池（不足 6 条也比白屏强），再给旧缓存，不给买家看白屏
    try {
      const pooled = await poolSearch(q, 8);
      if (pooled.length) return { items: pooled, total: null, page, source: "cache" };
    } catch {
      /* ignore */
    }
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
