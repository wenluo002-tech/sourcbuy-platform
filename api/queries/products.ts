import { getDb } from "./connection";
import { factories } from "../../db/schema";
import { eq } from "drizzle-orm";

// 1688 聚合 API（代购商品采集服务）——服务端专用，token 只在 .env，绝不下发浏览器
// 开发服务器可能早于 .env 写入启动，这里做惰性兜底加载
if (!process.env.ALIBABA_AGG_TOKEN) {
  try {
    process.loadEnvFile();
  } catch {
    /* .env 不存在时静默，调用处会报明确的配置错误 */
  }
}
const BASE = () => process.env.ALIBABA_AGG_BASE!;
const TOKEN = () => process.env.ALIBABA_AGG_TOKEN!;

export interface NormalizedOffer {
  offerId: string;
  title: string;
  categoryName: string | null;
  unit: string | null;
  images: string[];
  priceTiers: { minQty: number; price: number }[];
  skuCount: number;
  skuProps: { prop: string; values: string[] }[];
  attributes: Record<string, string>;
  shopName: string | null;
  shopUrl: string | null;
  memberId: string | null; // 1688 店铺子域名 = 工厂库 join key
  amountOnSale: number | null;
}

// 从文本中提取 1688 offer ID：支持纯数字 ID、offer/123.html、detail.1688.com 链接
export function extractOfferId(text: string): string | null {
  const m =
    text.match(/offer\/(\d+)\.html/i) ||
    text.match(/OFFERID=(\d+)/i) ||
    text.match(/1688\.com.*?(\d{9,})/i) ||
    text.match(/\b(\d{10,13})\b/);
  return m ? m[1] : null;
}

export async function fetchOffer(offerId: string): Promise<NormalizedOffer | null> {
  const url = `${BASE()}/${TOKEN()}/api/alibabaformat/offER?OFFERID=${encodeURIComponent(offerId)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`aggregator HTTP ${res.status}`);
  const body: any = await res.json();
  const d = body?.Data;
  if (!body?.Success || !d) return null;

  // Range 三种形态都见过：对象 {BeginAmount} / 直接数字 / 数字字符串（"20"）——逐个兜，NaN 落 0 不污染排序
  const toMinQty = (p: any): number => {
    const raw = p?.Range?.BeginAmount ?? p?.BeginAmount ?? (typeof p?.Range === "object" ? 0 : p?.Range) ?? 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const priceTiers = (d.PriceRangeInfos ?? d.OriginalPriceRangeInfos ?? [])
    .map((p: any) => ({
      minQty: toMinQty(p),
      price: Number(p.Price ?? 0),
    }))
    .filter((p: any) => p.price > 0)
    .sort((a: any, b: any) => a.minQty - b.minQty);

  const skuProps = (d.SkuProps ?? []).map((sp: any) => ({
    prop: String(sp.Prop ?? ""),
    values: (sp.Value ?? []).map((v: any) => String(v.name ?? v.Name ?? "")).filter(Boolean),
  }));

  const attributes: Record<string, string> = {};
  for (const t of d.ProductFeatureTuples ?? []) {
    if (t.Item1 && t.Item2) attributes[String(t.Item1)] = String(t.Item2);
  }

  const shopUrl: string | null = d.ShopUrl ?? null;
  let memberId: string | null = null;
  if (shopUrl) {
    const mm = shopUrl.match(/https?:\/\/([a-z0-9-]+)\.1688\.com/i);
    memberId = mm ? mm[1] : null;
  }

  return {
    offerId: String(d.OfferId ?? offerId),
    title: String(d.Subject ?? ""),
    categoryName: d.CategoryName ?? null,
    unit: d.Unit ?? null,
    images: (d.ImageUrls ?? []).slice(0, 6),
    priceTiers,
    skuCount: (d.SkuMaps ?? []).length,
    skuProps,
    attributes,
    shopName: d.ShopName ?? null,
    shopUrl,
    memberId,
    amountOnSale: d.AmountOnSale ?? null,
  };
}

// 关键 join：这个货背后的店铺，是不是我们 4,060 家严选工厂之一
export async function offerWithFactory(offerId: string) {
  const offer = await fetchOffer(offerId);
  if (!offer) return { offer: null, factory: null };
  let factory = null;
  if (offer.memberId) {
    const db = getDb();
    const rows = await db
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
      .where(eq(factories.memberId, offer.memberId))
      .limit(1);
    factory = rows[0] ?? null;
  }
  return { offer, factory };
}
