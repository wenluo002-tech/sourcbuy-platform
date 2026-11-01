import { getDb } from "./connection";
import { factories, factoryScores, commissionRules } from "../../db/schema";
import { eq, and, desc, like, gte, lte, sql, type SQL } from "drizzle-orm";

export interface FactoryFilter {
  tier?: string;
  location?: string;
  cert?: string;
  isSuper?: boolean;
  minScore?: number;
  minYears?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export async function findFactories(f: FactoryFilter) {
  const db = getDb();
  const conds: SQL[] = [];
  if (f.tier) conds.push(sql`${factories.tier} = ${f.tier}`);
  if (f.location) conds.push(like(factories.location, `%${f.location}%`));
  if (f.cert) conds.push(like(factories.cert, `%${f.cert}%`));
  if (f.isSuper) conds.push(eq2(factories.isSuper, true));
  if (f.minScore != null)
    conds.push(gte(factories.score, String(f.minScore)));
  if (f.minYears != null)
    conds.push(gte(factories.years, String(f.minYears)));
  if (f.keyword) {
    conds.push(
      sql`(${factories.name} LIKE ${"%" + f.keyword + "%"} OR ${factories.review} LIKE ${"%" + f.keyword + "%"} OR ${factories.productionType} LIKE ${"%" + f.keyword + "%"} OR ${factories.oemMode} LIKE ${"%" + f.keyword + "%"})`
    );
  }

  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(60, Math.max(1, f.pageSize ?? 20));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, cnt] = await Promise.all([
    db
      .select()
      .from(factories)
      .where(where)
      .orderBy(desc(factories.score))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ c: sql<number>`count(*)` })
      .from(factories)
      .where(where),
  ]);
  return { rows, total: cnt[0]?.c ?? 0, page, pageSize };
}

function eq2(col: any, val: any) {
  return eq(col, val);
}

export async function findFactoryById(id: number) {
  const db = getDb();
  const rows = await db.select().from(factories).where(eq(factories.id, id)).limit(1);
  if (!rows[0]) return null;
  const scores = await db
    .select()
    .from(factoryScores)
    .where(eq(factoryScores.factoryId, id))
    .limit(1);
  return { ...rows[0], scores: scores[0] ?? null };
}

export async function factoryStats() {
  const db = getDb();
  const byTier = await db
    .select({ tier: factories.tier, c: sql<number>`count(*)` })
    .from(factories)
    .groupBy(factories.tier);
  const total = await db.select({ c: sql<number>`count(*)` }).from(factories);
  const locations = await db
    .select({ location: factories.location, c: sql<number>`count(*)` })
    .from(factories)
    .groupBy(factories.location)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
  return { byTier, total: total[0]?.c ?? 0, topLocations: locations };
}

// ============ 佣金引擎（费率矩阵 v1.0）============

export async function calcCommission(purchaseAmountUsd: number, riskTier: "A" | "B" | "C") {
  const db = getDb();
  const rules = await db
    .select()
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.version, "v1.0"),
        eq(commissionRules.riskTier, riskTier),
        eq(commissionRules.status, "active"),
        lte(commissionRules.amountFrom, String(purchaseAmountUsd))
      )
    );
  const rule = rules.find(
    (r) => r.amountTo === null || purchaseAmountUsd < Number(r.amountTo)
  );
  if (!rule) throw new Error("no commission rule matched");
  const raw = purchaseAmountUsd * Number(rule.rate);
  const fee = Math.max(raw, Number(rule.minFee));
  return {
    fee: Math.round(fee * 100) / 100,
    rate: Number(rule.rate),
    minFeeApplied: raw < Number(rule.minFee),
    ruleVersion: rule.version,
  };
}

// ============ 到手价试算（蓝图 §5.5）============

export interface LandedPriceInput {
  unitPriceCny: number; // 出厂单价
  quantity: number;
  weightKg: number; // 单件实重
  dimCm?: { l: number; w: number; h: number }; // 单件尺寸
  riskTier: "A" | "B" | "C";
  channel: "express" | "line" | "sea"; // 快递/专线/海运
  exchangeRate?: number; // USD/CNY，默认 7.1
}

export async function calcLandedPrice(input: LandedPriceInput) {
  const rate = input.exchangeRate ?? 7.1;
  const purchaseCny = input.unitPriceCny * input.quantity;
  const purchaseUsd = purchaseCny / rate;

  // 体积重规则（蓝图 §3）：快递 ÷5000，专线 ÷6000
  const volDivisor = input.channel === "express" ? 5000 : 6000;
  const dim = input.dimCm ?? { l: 30, w: 20, h: 10 };
  const volWeight = (dim.l * dim.w * dim.h) / volDivisor;
  const chargeableWeight = Math.max(input.weightKg, volWeight) * input.quantity;

  // 国际运费单价（USD/kg，渠道均价，后续接 freight_rates 价格表）
  const freightRatePerKg = { express: 8.5, line: 5.2, sea: 1.8 }[input.channel];
  const intlFreight = chargeableWeight * freightRatePerKg;

  const domestic = 12; // 国内段集货均价（USD/票）
  const lastMile = input.channel === "sea" ? 35 : 21; // 尾程派送
  const duty = 0; // 关税预估默认 0，按目的国规则扩展

  const commission = await calcCommission(purchaseUsd, input.riskTier);

  const lines = [
    { key: "factory", label: "出厂价（工厂原始报价）", amount: r2(purchaseUsd) },
    { key: "domestic", label: "国内段运费（工厂→集货仓）", amount: r2(domestic) },
    { key: "commission", label: `履约佣金（${input.riskTier} 档 ${(commission.rate * 100).toFixed(1)}%）`, amount: commission.fee },
    { key: "freight", label: `国际运费（${chargeableWeight.toFixed(1)}kg 计费重）`, amount: r2(intlFreight) },
    { key: "duty", label: "关税预估", amount: r2(duty) },
    { key: "lastMile", label: "尾程派送", amount: r2(lastMile) },
  ];
  const total = r2(lines.reduce((s, l) => s + l.amount, 0));
  return {
    lines,
    total,
    perUnit: r2(total / input.quantity),
    currency: "USD",
    chargeableWeight: r2(chargeableWeight),
    commissionMeta: commission,
  };
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

// ============ AI 选厂推荐（骨架：规则引擎版，LLM 层后续接入）============

export async function matchFactories(intent: {
  keyword?: string;
  location?: string;
  minScore?: number;
  limit?: number;
}) {
  // 推荐中立条款（费率矩阵 v1.0 §3.3）：排序仅依据评分与经营指标，工厂不可付费影响
  const res = await findFactories({
    keyword: intent.keyword,
    location: intent.location,
    minScore: intent.minScore ?? 85,
    page: 1,
    pageSize: Math.min(6, Math.max(3, intent.limit ?? 6)),
  });
  return res.rows.map((f) => ({
    id: f.id,
    name: f.name,
    tier: f.tier,
    score: f.score ? Number(f.score) : null,
    years: f.years ? Number(f.years) : null,
    location: f.location,
    cert: f.cert,
    repurchaseRate: f.repurchaseRate ? Number(f.repurchaseRate) : null,
    mainImage: f.mainImage,
    reason: buildReason(f),
  }));
}

function buildReason(f: typeof factories.$inferSelect): string {
  const parts: string[] = [];
  if (f.tier === "金标") parts.push("金标严选");
  if (f.years && Number(f.years) >= 10) parts.push(`${Number(f.years)} 年老厂`);
  if (f.repurchaseRate && Number(f.repurchaseRate) >= 70)
    parts.push(`复购率 ${Number(f.repurchaseRate)}%`);
  if (f.replyRate && Number(f.replyRate) >= 90)
    parts.push(`回复率 ${Number(f.replyRate)}%`);
  if (f.cert) parts.push("第三方认证");
  return parts.join(" · ") || "综合评分入选";
}
