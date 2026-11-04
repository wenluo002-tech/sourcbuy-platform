// 统一商品模型（Offer）——货源适配层的对内契约
// 上游无论万邦还是点金，进系统前都必须归一化成这个形状；前端只认它

export interface OfferSku {
  skuId: string | null;
  specText: string; // 规格串，如 "渐变紫-一体轮>18寸"
  price: number | null; // 单 SKU 成交价；该 listing 不支持 SKU 级定价时为 null（前端回落阶梯价）
  listPrice: number | null; // 划线价
  stock: number | null; // canBookCount
  weightKg: number | null; // 该 SKU 单件重量（多源交叉校验后）
  image: string | null; // 该规格对应图片（skuProps 第一维规格图）
}

export interface OfferDetail {
  offerId: string;
  title: string;
  images: string[];
  priceTiers: { minQty: number; price: number }[]; // 阶梯价
  priceMin: number | null;
  priceMax: number | null;
  moq: number | null; // 起订量（offerBeginAmount）
  skus: OfferSku[];
  sales: number | null;
  unitWeightKg: number | null; // 单件重量（取 SKU 重量中位数或值）
  sellerName: string | null; // 公司名
  memberId: string | null; // 1688 会员 ID（b2b-xxx 新格式）= factories.member_id join key 之一
  sellerLoginId: string | null; // 会员登录名（老格式，如 hnmeikan）= join key 之二（严选库 19% 用它）
  dispatchHours: number | null; // 承诺发货时效（小时）
  dispatchNote: string | null; // 原文，如 "承诺48小时发货·常发圆通快递"
  specImages: Record<string, string>; // 第一维规格值（如颜色名）→ 图片 URL（skuProps）
  source: "wanbang" | "dianjin" | "legacy" | "cache";
  fetchedAt: string; // ISO 时间
}

export interface OfferSearchItem {
  offerId: string;
  title: string;
  image: string | null;
  price: number;
  promotionPrice: number | null;
  sales: number;
}

export interface OfferSearchResult {
  items: OfferSearchItem[];
  total: number | null;
  page: number;
  source: "wanbang" | "cache";
}
