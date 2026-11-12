// 严选评分体系 v2——公开算法（费率矩阵 v1.0 §3.3 推荐中立条款的配套）
// 2026-11-12 推翻重建：旧 7 维子分来自历史 CSV 成品列、口径不可核查，整体废弃。
// v2 全部维度映射自平台实抓、可核查的字段；映射规则公开；数据缺失的维度不计权重；
// 金标（塔尖推荐位）额外要求数据覆盖度 ≥85%——看不全的厂，不给塔尖位。
export interface ScoreDimension {
  key: string;
  label: string;
  weight: number; // 0-1
  desc: string; // 这个维度看什么
}

export interface FactoryScoreInput {
  cert: string | null;
  isSuper: number | null;
  deepInspected: number | null;
  hasImages: boolean;
  years: number | null;
  repurchaseRate: number | null;
  monthlyBuyers: number | null;
  productionType: string | null;
  areaSqm: number | null;
  employeeCount: number | null;
}

// ── 维度映射规则（全部显式、公开可辩护；输出 0-100，null=该维度数据缺失不计权重） ──
const STRONG_CERT = /sgs|intertek|tuv|bv |必维|ul|莱茵|天祥/i;
const MID_CERT = /iso|认证|专利|高新|ce|fda|rohs/i;

/** 资质认证：无记录 45；普通资质记录 60；ISO/CE/FDA 等 75；SGS/Intertek/TÜV 等知名第三方 90；平台超级工厂背书再上浮 */
export function certScore(cert: string | null, isSuper: number | null): number {
  let s = 45;
  if (cert && STRONG_CERT.test(cert)) s = 90;
  else if (cert && MID_CERT.test(cert)) s = 75;
  else if (cert && cert.trim()) s = 60;
  if (isSuper === 1) s = Math.min(95, Math.max(s, 80) + 5);
  return s;
}

/** 实地核验：深度验厂 90；有实拍图档 70；都没有 50（未验≠差，中性偏低） */
export function auditScore(deepInspected: number | null, hasImages: boolean): number {
  if (deepInspected === 1) return 90;
  if (hasImages) return 70;
  return 50;
}

/** 经营年限：分段线性，1 年 50 → 16 年以上 95；无记录不计权重 */
export function yearScore(y: number | null): number | null {
  if (y == null || y <= 0) return null;
  const pts: [number, number][] = [[1, 50], [3, 62], [5, 72], [8, 82], [12, 90], [16, 95], [50, 95]];
  for (let i = 1; i < pts.length; i++)
    if (y <= pts[i][0])
      return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (y - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
  return 95;
}

/** 复购表现：老买家用订单投票；无记录 55 中性 */
export function repScore(r: number | null): number {
  if (r == null) return 55;
  if (r >= 55) return 92;
  if (r >= 40) return 85;
  if (r >= 25) return 78;
  if (r >= 10) return 68;
  if (r > 0) return 58;
  return 50;
}

/** 出货活跃度：月采购买家数分档；无记录不计权重 */
export function salesScore(monthlyBuyers: number | null): number | null {
  if (monthlyBuyers == null) return null;
  const mb = monthlyBuyers;
  if (mb >= 3000) return 95;
  if (mb >= 1000) return 90;
  if (mb >= 200) return 82;
  if (mb >= 50) return 72;
  if (mb >= 10) return 62;
  if (mb > 0) return 55;
  return 48;
}

/** 生产能力：生产型 78 起，面积/人数上大台阶再上浮；纯贸易型记录 55 */
export function prodScore(productionType: string | null, areaSqm: number | null, employeeCount: number | null): number {
  let s = 55;
  if (productionType && productionType.includes("生产")) s = 78;
  if (areaSqm != null && areaSqm >= 5000) s = Math.max(s, 86);
  else if (areaSqm != null && areaSqm >= 1000) s = Math.max(s, 80);
  if (employeeCount != null && employeeCount >= 100) s = Math.max(s, 85);
  else if (employeeCount != null && employeeCount >= 50) s = Math.max(s, 80);
  return s;
}

export const SCORING_FORMULA: {
  version: string;
  effectiveDate: string;
  dimensions: ScoreDimension[];
  /** 数据覆盖度（已计权重之和）低于此值不出综合分 */
  minCoverage: number;
  /** 金标额外闸：覆盖度低于此值最高只能到银标 */
  goldDataGate: number;
  tiers: { tier: string; min: number }[];
  note: string;
} = {
  version: "v2",
  effectiveDate: "2026-11-12",
  dimensions: [
    { key: "cert", label: "资质认证", weight: 0.2, desc: "第三方认证与平台背书（SGS / Intertek / ISO 等）" },
    { key: "audit", label: "实地核验", weight: 0.15, desc: "是否深度验厂、有无实拍图档——看过现场才给高分" },
    { key: "rep", label: "复购表现", weight: 0.2, desc: "老买家用订单投票——最真实的质量信号" },
    { key: "year", label: "经营年限", weight: 0.15, desc: "持续经营历史，分段计分" },
    { key: "sales", label: "出货活跃度", weight: 0.15, desc: "月采购买家数——真实出货热度" },
    { key: "prod", label: "生产能力", weight: 0.15, desc: "生产类型、厂房面积与员工规模" },
  ],
  minCoverage: 0.4,
  goldDataGate: 0.85,
  // 阈值按全库分位数定档后固定写死：金≈前3%、银≈前12%、铜≈前30%、优选≈前55%
  tiers: [
    { tier: "金标", min: 90 },
    { tier: "银标", min: 86 },
    { tier: "铜标", min: 83 },
    { tier: "优选", min: 75 },
    { tier: "培育", min: 0 },
  ],
  note: "综合评分 = 六维加权（缺失维度不计权重）。权重公开、不可购买、不接受工厂付费调分。金标要求数据覆盖度 ≥85%。",
};

export interface FactoryScoreResult {
  dims: Record<string, number | null>;
  coverage: number; // 已计权重之和 0-1
  score: number | null; // null = 数据太薄不出分
  tier: string;
  confidence: "high" | "medium" | "low";
}

/** 全量评分入口：正式厂（非贸易商、非重复店铺）专用 */
export function computeFactoryScore(f: FactoryScoreInput): FactoryScoreResult {
  const dims: Record<string, number | null> = {
    cert: certScore(f.cert, f.isSuper),
    audit: auditScore(f.deepInspected, f.hasImages),
    rep: repScore(f.repurchaseRate),
    year: yearScore(f.years),
    sales: salesScore(f.monthlyBuyers),
    prod: prodScore(f.productionType, f.areaSqm, f.employeeCount),
  };
  let wsum = 0;
  let acc = 0;
  for (const d of SCORING_FORMULA.dimensions) {
    const v = dims[d.key];
    if (v == null) continue;
    acc += v * d.weight;
    wsum += d.weight;
  }
  const score = wsum < SCORING_FORMULA.minCoverage ? null : Math.round((acc / wsum) * 10) / 10;
  let tier = "培育";
  if (score != null) {
    for (const t of SCORING_FORMULA.tiers) {
      if (score >= t.min) {
        tier = t.tier;
        break;
      }
    }
    // 缺一门以上数据不给塔尖位（看不全的厂不推荐到塔尖）
    if (tier === "金标" && wsum < SCORING_FORMULA.goldDataGate) tier = "银标";
  }
  const confidence = wsum >= SCORING_FORMULA.goldDataGate ? "high" : wsum >= 0.7 ? "medium" : "low";
  return { dims, coverage: Math.round(wsum * 100) / 100, score, tier, confidence };
}
