// 点金 —— 纯灾备货源 API（全 HTTP 明文，只在万邦失败时兜底；不再充值，499 积分烧完即止）
// 计费：1688xq3 = 0.28 积分/次（1 积分 = 1 元），失败不扣费，流水后台可查
// 结构：价格组件（@ali/tdmod-od-fx-pc-offer-price）的 data.offerDomain 是二次编码 JSON 字符串，
//       顶层 skuModel 是干扰字段，真数据必须解析 offerDomain（2026-11-03 被服务商纠正过的坑）
import type { OfferDetail, OfferSku } from "../../contracts/offer";

if (!process.env.DIANJIN_USER) {
  try {
    process.loadEnvFile();
  } catch {
    /* 调用处报配置错误 */
  }
}
const BASE = () => process.env.DIANJIN_BASE ?? "http://38.207.179.41:8256";
const USER = () => process.env.DIANJIN_USER!;
const PASS = () => process.env.DIANJIN_PASS!;
const KEY_ID = () => process.env.DIANJIN_KEY_ID ?? "65";

export const DIANJIN_COST = 0.28;

let cachedToken: string | null = null;

async function login(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await fetch(`${BASE()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER(), password: PASS() }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`dianjin login HTTP ${res.status}`);
  const j: any = await res.json();
  const token = j?.data?.token ?? j?.token;
  if (!token) throw new Error(`dianjin login failed: ${j?.msg ?? j?.message ?? "no token"}`);
  cachedToken = String(token);
  return cachedToken;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function tryParse(v: unknown): any {
  if (typeof v !== "string") return v;
  try {
    const once = JSON.parse(v);
    return typeof once === "string" ? tryParse(once) : once; // 二次编码
  } catch {
    return v;
  }
}

// ---------- 1688详情3（1688xq3，0.28 元/次）→ OfferDetail ----------
export async function djGetOffer(offerId: string): Promise<OfferDetail | null> {
  const token = await login();
  const res = await fetch(`${BASE()}/api/user/api-apps/1688xq3/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ keyId: Number(KEY_ID()), params: { itemid: offerId } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    if (res.status === 401) cachedToken = null; // token 过期，下次重登
    throw new Error(`dianjin HTTP ${res.status}`);
  }
  const j: any = await res.json();
  // 双层信封：{success, data:{success, data:{组件字典}, statusCode, pointCost}}
  const inner: any = j?.data ?? j;
  const body: any = inner?.data && typeof inner.data === "object" ? inner.data : inner;
  if (body == null || typeof body !== "object") return null;

  // 扫描所有组件，找 offerDomain（价格组件）与标题/主图
  let domain: any = null;
  let title = "";
  const images: string[] = [];
  for (const comp of Object.values(body) as any[]) {
    const d = comp?.data ?? comp;
    if (!d || typeof d !== "object") continue;
    if (!domain && d.offerDomain) domain = tryParse(d.offerDomain);
    if (!title && typeof d.title === "string" && d.title.length > 3) title = d.title;
    const imgs = d.mainImage ?? d.images;
    if (Array.isArray(imgs)) {
      for (const im of imgs) {
        const u = String(im?.fullPathImageURI ?? im?.url ?? im ?? "");
        if (u && images.length < 10) images.push(u);
      }
    }
  }
  if (!domain && !title) return null;

  // offerDomain 结构：sellerModel.winportUrl / tradeModel.tradeWithoutPromotion.skuMapOriginal
  const winport: string = String(domain?.sellerModel?.winportUrl ?? "");
  const mm = winport.match(/https?:\/\/([a-z0-9-]+)\.1688\.com/i);
  const memberId = mm ? mm[1] : null;
  const sellerName = domain?.sellerModel?.loginId ? String(domain.sellerModel.loginId) : null;
  if (!title) title = String(domain?.offerModel?.title ?? domain?.title ?? "");
  if (images.length === 0) {
    const imgs = domain?.offerModel?.images ?? domain?.images;
    if (Array.isArray(imgs)) {
      for (const im of imgs.slice(0, 10)) images.push(String(im?.fullPathImageURI ?? im?.url ?? im ?? ""));
    }
  }

  const twp: any = domain?.tradeModel?.tradeWithoutPromotion ?? {};
  const moq = num(twp?.offerBeginAmount);
  const priceMin = num(twp?.offerMinPrice);
  const priceMax = num(twp?.offerMaxPrice);
  const tiers = (domain?.priceModel?.currentPrices ?? twp?.currentPrices ?? [])
    .map((p: any) => ({ minQty: Number(p.beginAmount ?? 0), price: Number(p.price ?? 0) }))
    .filter((p: any) => p.price > 0)
    .sort((a: any, b: any) => a.minQty - b.minQty);

  const skuRaw: any = twp?.skuMapOriginal ?? {};
  const entries: any[] = Array.isArray(skuRaw) ? skuRaw : Object.entries(skuRaw).map(([k, v]) => ({ ...((v as any) ?? {}), specAttrs: k }));
  const skus: OfferSku[] = entries.map((s: any) => ({
    skuId: s?.skuId ? String(s.skuId) : null,
    specText: String(s?.specAttrs ?? s?.specText ?? "").replace(/&gt;/g, ">"),
    price: Number(s?.discountPrice ?? s?.price ?? 0),
    listPrice: num(s?.price),
    stock: num(s?.canBookCount),
    weightKg: null, // 点金详情3 无每 SKU 重量字段
  }));

  return {
    offerId,
    title,
    images,
    priceTiers: tiers,
    priceMin,
    priceMax,
    moq,
    skus,
    sales: null,
    unitWeightKg: null,
    sellerName,
    memberId,
    dispatchHours: null,
    dispatchNote: null,
    source: "dianjin",
    fetchedAt: new Date().toISOString(),
  };
}
