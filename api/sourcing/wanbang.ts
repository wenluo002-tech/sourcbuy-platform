// 万邦 onebound —— 主力货源 API（2026-11-03 实测验证字段路径，勿凭印象改）
// 价格（文字留证）：item_search/item_search_factory/item_fee 0.022 元/次，item_get_app 0.05 元/次
// 计费口径：返回 error_code 0000 即扣费（下架/无库存也照扣），其他错误码不扣
// 限流：单线程 1 秒/次；测试 key 每日 200 次
import type { OfferDetail, OfferSku, OfferSearchItem } from "../../contracts/offer";

if (!process.env.WANBANG_KEY) {
  try {
    process.loadEnvFile();
  } catch {
    /* 调用处报配置错误 */
  }
}
const BASE = () => process.env.WANBANG_BASE ?? "https://api-gw.onebound.cn/1688";
const KEY = () => process.env.WANBANG_KEY!;
const SECRET = () => process.env.WANBANG_SECRET!;

export const WANBANG_COST = {
  item_search: 0.022,
  item_search_factory: 0.022,
  item_fee: 0.022,
  item_get_app: 0.05,
} as const;

export class WanbangError extends Error {
  public readonly billed: boolean;
  constructor(message: string, billed: boolean) {
    super(message);
    this.billed = billed;
  }
}

async function call<T = any>(endpoint: string, params: Record<string, string>): Promise<{ data: T; billed: boolean }> {
  const qs = new URLSearchParams({ key: KEY(), secret: SECRET(), lang: "zh-CN", cache: "no", ...params });
  const res = await fetch(`${BASE()}/${endpoint}/?${qs}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new WanbangError(`wanbang HTTP ${res.status}`, false);
  const j: any = await res.json();
  const billed = j?.error_code === "0000" || j?.error === "" || j?.error_code === undefined;
  if (j?.error && j.error_code !== "0000") {
    // 无权/超限/参数错等：不扣费但算失败，抛出让上层走灾备
    throw new WanbangError(`wanbang ${endpoint}: ${j.error} (${j.error_code ?? "?"})`, false);
  }
  return { data: j as T, billed };
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- item_search：关键词 → 商品摘要列表（0.022 元/次） ----------
export async function wbSearchItems(q: string, page = 1): Promise<{ items: OfferSearchItem[]; total: number | null; billed: boolean }> {
  const { data, billed } = await call("item_search", { q, page: String(page), page_size: "40" });
  const box: any = (data as any)?.items ?? data;
  const arr: any[] = Array.isArray(box?.item) ? box.item : Array.isArray(box) ? box : [];
  const items: OfferSearchItem[] = arr
    .map((it: any) => ({
      offerId: String(it.num_iid ?? ""),
      title: String(it.title ?? ""),
      image: it.pic_url ? String(it.pic_url) : null,
      price: Number(it.price ?? 0),
      promotionPrice: num(it.promotion_price),
      sales: Number(it.sales ?? 0),
    }))
    .filter((it) => it.offerId && it.title);
  const total = num(box?.total_results ?? box?.total ?? (data as any)?.total);
  return { items, total, billed };
}

// ---------- item_search_factory：公司名 → seller_nick（join key 反查兜底，0.022 元/次） ----------
export async function wbSearchFactoryNick(companyName: string): Promise<string | null> {
  const { data } = await call("item_search_factory", { q: companyName, page: "1" });
  const arr: any[] = Array.isArray((data as any)?.item) ? (data as any).item : [];
  const hit = arr.find((f: any) => String(f?.title ?? "").includes(companyName.slice(0, 6))) ?? arr[0];
  return hit?.seller_nick ? String(hit.seller_nick) : null;
}

// ---------- item_get_app：全能详情（0.05 元/次） ----------
// 已验证路径：title=productTitle.fields.title；图片=Root.fields.dataJson.images[].fullPathImageURI；
// 子域名=offerBaseInfo.sellerWinportUrl；MOQ=finalPriceModel.tradeWithoutPromotion.offerBeginAmount；
// 阶梯价=mainPrice.fields.priceModel.currentPrices；SKU=skuModel.skuInfoMapOriginal；
// 重量=freightInfo.skuWeight{skuId:kg} 或 productPackInfo pieceWeightScaleInfo(克,按规格名 join)；
// 交期=buyerProtectionModel[].agreeDeliveryHours + shippingServices.fields.deliveryLimitText
export async function wbGetOfferApp(offerId: string): Promise<{ offer: OfferDetail | null; billed: boolean }> {
  const { data, billed } = await call("item_get_app", { num_iid: offerId });
  const result: any = (data as any)?.item?.result ?? {};
  const d: any = result?.data;
  if (!d) return { offer: null, billed }; // 下架/不存在：也计费（billed=true）

  const dj: any = d?.Root?.fields?.dataJson ?? {};
  const mainPrice: any = d?.mainPrice?.fields ?? {};
  const shipping: any = d?.shippingServices?.fields ?? {};

  const title = String(d?.productTitle?.fields?.title ?? dj?.tempModel?.offerTitle ?? "");
  const images: string[] = (dj?.images ?? [])
    .map((im: any) => String(im?.fullPathImageURI ?? im?.searchImageURI ?? ""))
    .filter(Boolean)
    .slice(0, 10);

  // 卖家身份（v48 修正）：join 严选库的钥匙是 sellerModel.memberId（b2b-xxx，严选库 81% 用这个格式），
  // 老会员是 loginId（严选库 19%）——两个都存，join 时双键匹配。
  // 之前错用 winport 店铺子域名（shopXXX），与严选库零交集，以货带厂永远 miss。
  const sellerModel: any = result?.global?.globalData?.model?.sellerModel ?? {};
  const obi: any = dj?.offerBaseInfo ?? {};
  const winport: string = String(sellerModel?.winportUrl ?? obi?.sellerWinportUrl ?? "");
  const mm = winport.match(/https?:\/\/([a-z0-9-]+)\.1688\.com/i);
  const memberId = sellerModel?.memberId ? String(sellerModel.memberId) : mm ? mm[1] : null;
  const sellerLoginId = sellerModel?.loginId ? String(sellerModel.loginId) : obi?.sellerLoginId ? String(obi.sellerLoginId) : null;
  const sellerName = sellerModel?.companyName ? String(sellerModel.companyName) : sellerLoginId;

  // 阶梯价（上游可能返回同 beginAmount 的重复档，按 minQty 去重留低价）
  const tierRaw = (mainPrice?.priceModel?.currentPrices ?? mainPrice?.originalPricesWithoutPromotion ?? [])
    .map((p: any) => ({ minQty: Number(p.beginAmount ?? 0), price: Number(p.price ?? 0) }))
    .filter((p: any) => p.price > 0)
    .sort((a: any, b: any) => a.minQty - b.minQty);
  const tierMap = new Map<number, number>();
  for (const t of tierRaw) tierMap.set(t.minQty, Math.min(tierMap.get(t.minQty) ?? Infinity, t.price));
  const tiers = [...tierMap.entries()].map(([minQty, price]) => ({ minQty, price })).sort((a, b) => a.minQty - b.minQty);
  const twp: any = mainPrice?.finalPriceModel?.tradeWithoutPromotion ?? {};
  const moq = num(twp?.offerBeginAmount ?? shipping?.startAmount);
  const priceMin = num(twp?.offerMinPrice) ?? tiers[0]?.price ?? null;
  const priceMax = num(twp?.offerMaxPrice) ?? tiers[tiers.length - 1]?.price ?? null;

  // SKU 重量（多源交叉校验——上游单位随 listing 飘忽：pieceWeightScaleInfo.weight 实测有公斤(童车10)
  // 也有克(瑜伽裤500)，freightInfo.skuWeight 有公斤(0.5)也有吨(0.01)。孤证不信，两源相符才采用）：
  //   pack 源候选：weight 按公斤 / 按克(÷1000) / 体积重(volume cm³÷6000)
  //   freight 源候选：skuWeight 按公斤 / 按吨(×1000)
  const skuWeightMap: Record<string, number> = shipping?.freightInfo?.skuWeight ?? {};
  const packList: any[] = d?.productPackInfo?.fields?.pieceWeightScale?.pieceWeightScaleInfo ?? [];
  const packBySkuId = new Map<string, any>();
  const packBySpec = new Map<string, any>();
  for (const p of packList) {
    if (p?.skuId) packBySkuId.set(String(p.skuId), p);
    const spec = [p?.sku1, p?.sku2, p?.sku3].filter(Boolean).join(">");
    if (spec) packBySpec.set(spec, p);
  }
  const BAND: [number, number] = [0.02, 60]; // 单件合理带（公斤）；超出即不可信
  const inBand = (w: number | null): w is number => w != null && w >= BAND[0] && w <= BAND[1];
  const close = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) <= 0.35;
  const resolveWeightKg = (pack: any, skuId: string | null): number | null => {
    const packCands: number[] = [];
    const pw = num(pack?.weight);
    if (pw != null) { packCands.push(pw, pw / 1000); }
    const vol = num(pack?.volume);
    if (vol != null && vol > 0) packCands.push(vol / 6000);
    const frCands: number[] = [];
    const sw = skuId ? num(skuWeightMap[skuId]) : null;
    if (sw != null) { frCands.push(sw, sw * 1000); }
    // ① pack 与 freight 两源在合理带内相符 → 取 pack 侧（更贴近打包实测）
    for (const a of packCands) for (const b of frCands) {
      if (inBand(a) && inBand(b) && close(a, b)) return Math.round(a * 1000) / 1000;
    }
    // ② 体积重与任一源相符（抛货场景）
    const volW = vol != null && vol > 0 ? vol / 6000 : null;
    if (volW != null) {
      for (const c of [...packCands, ...frCands]) {
        if (inBand(c) && close(c, volW)) return Math.round(c * 1000) / 1000;
      }
    }
    // ③ 只剩唯一落在合理带内的候选才用；多个打架 → null（宁可显式估算）
    const solo = [...packCands, ...frCands].filter(inBand);
    return solo.length === 1 ? Math.round(solo[0] * 1000) / 1000 : null;
  };
  // 规格图：skuProps 第一维（通常是颜色）每个值带 imageUrl
  const specImages: Record<string, string> = {};
  for (const grp of dj?.skuModel?.skuProps ?? []) {
    for (const v of grp?.value ?? []) {
      if (v?.name && v?.imageUrl && !specImages[String(v.name)]) specImages[String(v.name)] = String(v.imageUrl);
    }
  }
  const skuMap: Record<string, any> = dj?.skuModel?.skuInfoMapOriginal ?? dj?.skuModel?.skuInfoMap ?? {};
  const posNum = (v: unknown): number | null => {
    const n = num(v);
    return n != null && n > 0 ? n : null;
  };
  const skus: OfferSku[] = Object.entries(skuMap).map(([specText, s]: [string, any]) => {
    const skuId = s?.skuId ? String(s.skuId) : null;
    const pack = (skuId && packBySkuId.get(skuId)) || packBySpec.get(specText) || null;
    const cleanSpec = specText.replace(/&gt;/g, ">");
    return {
      skuId,
      specText: cleanSpec,
      price: posNum(s?.discountPrice) ?? posNum(s?.price), // 该 listing 无 SKU 级定价时=null，前端走阶梯价
      listPrice: posNum(s?.price),
      stock: num(s?.canBookCount),
      weightKg: resolveWeightKg(pack, skuId),
      image: specImages[cleanSpec.split(">")[0]?.trim()] ?? null,
    };
  });

  // 单件重量 = SKU 重量众数
  const weights = skus.map((s) => s.weightKg).filter((w): w is number => w != null && w > 0);
  const unitWeightKg = weights.length ? weights.sort((a, b) => a - b)[Math.floor(weights.length / 2)] : null;

  // 交期
  const bpm: any[] = shipping?.buyerProtectionModel ?? [];
  const dispatchHours = num(bpm.find((b) => b?.agreeDeliveryHours)?.agreeDeliveryHours);
  const dispatchNote = shipping?.deliveryLimitText ? String(shipping.deliveryLimitText) : null;

  // 销量 = SKU 销量求和（app 版无总销量字段）
  const salesSum = Object.values(skuMap).reduce((acc: number, s: any) => acc + (num(s?.saleCount) ?? 0), 0);

  const offer: OfferDetail = {
    offerId,
    title,
    images,
    priceTiers: tiers,
    priceMin,
    priceMax,
    moq,
    skus,
    sales: salesSum > 0 ? salesSum : null,
    unitWeightKg,
    sellerName,
    memberId,
    sellerLoginId,
    dispatchHours,
    dispatchNote,
    specImages,
    source: "wanbang",
    fetchedAt: new Date().toISOString(),
  };
  return { offer: title ? offer : null, billed };
}
