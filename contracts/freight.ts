/**
 * 运费与目的地规则（老站运输服务协议原文提取 + 渠道均价）
 *
 * 数据来源纪律：
 * - 体积重除数：老站《运输服务协议》第六条原文（真实规则，按渠道×目的地区分）
 * - 每公斤均价：现阶段为渠道均价估算值（express 8.5 / line 5.2 / sea 1.8 USD/kg），
 *   前台必须标注"渠道均价估算"。待用户谈回 UPS 分区价格矩阵与各专线价格表后，
 *   按 目的地分区×重量段 替换为真实价格（表结构预留 freight_rates）。
 * - 参考时效：行业常规区间，标注"参考"，不作赔付承诺。
 */

export interface Destination {
  code: string; // ISO 3166-1 alpha-2
  zh: string;
  en: string;
  group: string; // 分组，用于下拉 optgroup
}

/** 主要市场国家列表（跨境 B2B 高频目的地；价格目前不分国别，规则分） */
export const DESTINATIONS: Destination[] = [
  { code: "US", zh: "美国", en: "United States", group: "北美" },
  { code: "CA", zh: "加拿大", en: "Canada", group: "北美" },
  { code: "MX", zh: "墨西哥", en: "Mexico", group: "北美" },
  { code: "GB", zh: "英国", en: "United Kingdom", group: "欧洲" },
  { code: "DE", zh: "德国", en: "Germany", group: "欧洲" },
  { code: "FR", zh: "法国", en: "France", group: "欧洲" },
  { code: "IT", zh: "意大利", en: "Italy", group: "欧洲" },
  { code: "ES", zh: "西班牙", en: "Spain", group: "欧洲" },
  { code: "NL", zh: "荷兰", en: "Netherlands", group: "欧洲" },
  { code: "PL", zh: "波兰", en: "Poland", group: "欧洲" },
  { code: "JP", zh: "日本", en: "Japan", group: "东亚" },
  { code: "KR", zh: "韩国", en: "South Korea", group: "东亚" },
  { code: "TW", zh: "中国台湾", en: "Taiwan", group: "东亚" },
  { code: "SG", zh: "新加坡", en: "Singapore", group: "东南亚" },
  { code: "MY", zh: "马来西亚", en: "Malaysia", group: "东南亚" },
  { code: "TH", zh: "泰国", en: "Thailand", group: "东南亚" },
  { code: "VN", zh: "越南", en: "Vietnam", group: "东南亚" },
  { code: "PH", zh: "菲律宾", en: "Philippines", group: "东南亚" },
  { code: "ID", zh: "印度尼西亚", en: "Indonesia", group: "东南亚" },
  { code: "AU", zh: "澳大利亚", en: "Australia", group: "大洋洲" },
  { code: "NZ", zh: "新西兰", en: "New Zealand", group: "大洋洲" },
  { code: "AE", zh: "阿联酋", en: "UAE", group: "中东" },
  { code: "SA", zh: "沙特阿拉伯", en: "Saudi Arabia", group: "中东" },
  { code: "IL", zh: "以色列", en: "Israel", group: "中东" },
  { code: "IN", zh: "印度", en: "India", group: "南亚" },
  { code: "BR", zh: "巴西", en: "Brazil", group: "拉美" },
  { code: "CL", zh: "智利", en: "Chile", group: "拉美" },
  { code: "CO", zh: "哥伦比亚", en: "Colombia", group: "拉美" },
  { code: "ZA", zh: "南非", en: "South Africa", group: "非洲" },
  { code: "NG", zh: "尼日利亚", en: "Nigeria", group: "非洲" },
];

export function findDestination(code?: string | null): Destination | null {
  if (!code) return null;
  return DESTINATIONS.find((d) => d.code === code.toUpperCase()) ?? null;
}

/**
 * 体积重除数（老站《运输服务协议》第六条原文规则）：
 * - 国际快递（DHL/UPS/TNT/FED）：÷5000
 * - 国际专线 台湾/新加坡/马来西亚/日本：普货 ÷6000 与实重取平均，特货 ÷6000
 * - 国际专线 欧洲铁路：÷6000；欧洲空派：÷5000
 * - 国际专线 美国/加拿大 空派及海派：÷6000
 * - 海运散货：÷6000
 */
export const SPECIAL_AVG_LINE_CODES = ["TW", "SG", "MY", "JP"] as const;
const EU_CODES = ["GB", "DE", "FR", "IT", "ES", "NL", "PL"] as const;

export type Channel = "express" | "line" | "sea";

export function volumetricRule(
  channel: Channel,
  destCode?: string | null
): { divisor: number; avgWithActual: boolean; note: string } {
  const code = destCode?.toUpperCase() ?? null;
  if (channel === "express") {
    return { divisor: 5000, avgWithActual: false, note: "国际快递 ÷5000" };
  }
  if (channel === "sea") {
    return { divisor: 6000, avgWithActual: false, note: "海运 ÷6000" };
  }
  // line 空派专线
  if (code && (SPECIAL_AVG_LINE_CODES as readonly string[]).includes(code)) {
    return {
      divisor: 6000,
      avgWithActual: true,
      note: "专线（台/新/马/日）普货：体积重÷6000 与实重取平均",
    };
  }
  if (code && (EU_CODES as readonly string[]).includes(code)) {
    return { divisor: 5000, avgWithActual: false, note: "欧洲空派 ÷5000（铁路 ÷6000）" };
  }
  return { divisor: 6000, avgWithActual: false, note: "专线 ÷6000" };
}

/** 渠道均价（USD/kg，估算值——真实分区价格矩阵待谈回后替换） */
export const CHANNEL_RATE_PER_KG: Record<Channel, number> = {
  express: 8.5,
  line: 5.2,
  sea: 1.8,
};

/** 参考时效（行业常规区间，仅参考） */
export const CHANNEL_TRANSIT: Record<Channel, string> = {
  express: "约 3–7 天",
  line: "约 8–15 天",
  sea: "约 25–40 天",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  express: "国际快递",
  line: "空派专线",
  sea: "海运",
};

/**
 * 老采购渠道推荐（先算钱，再看时效）：
 * - ≤45kg：快递（小货段价格结构有优势，时效最快）
 * - >45kg：比海运与专线的到手价差距——
 *   海运能省 ≥25% 就推海运（省的是真金白银，代价是 2-3 周时效，写清楚让买家自己权衡）；
 *   省不到 25% 推专线（差价不值得多等）。
 */
export function recommendChannel(
  chargeableKg: number,
  totals: Record<Channel, number>
): { channel: Channel; reason: string } {
  if (chargeableKg <= 45) {
    return {
      channel: "express",
      reason: `计费重 ${chargeableKg.toFixed(0)}kg 属小货段，国际快递价格结构有优势，${CHANNEL_TRANSIT.express}到手`,
    };
  }
  const seaSave = totals.line - totals.sea;
  const seaSavePct = seaSave / totals.line;
  if (seaSavePct >= 0.25) {
    return {
      channel: "sea",
      reason: `海运比专线省 $${seaSave.toFixed(0)}（${(seaSavePct * 100).toFixed(0)}%），省的是真金白银，代价是慢 2-3 周（${CHANNEL_TRANSIT.sea}）——交期允许就走海运`,
    };
  }
  return {
    channel: "line",
    reason: `海运只省 $${Math.max(0, seaSave).toFixed(0)}（${(Math.max(0, seaSavePct) * 100).toFixed(0)}%），不值得多等 2-3 周，空派专线（${CHANNEL_TRANSIT.line}）时效与成本最平衡`,
  };
}
