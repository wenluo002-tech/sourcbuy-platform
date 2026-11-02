import { getDb } from "./connection";
import { factories, factoryScores, factoryCategories, commissionRules } from "../../db/schema";
import { eq, and, desc, like, gte, lte, sql, type SQL } from "drizzle-orm";
import { expandQuery } from "../../contracts/lexicon";
import {
  volumetricRule,
  findDestination,
  recommendChannel,
  CHANNEL_RATE_PER_KG,
  CHANNEL_TRANSIT,
  CHANNEL_LABEL,
} from "../../contracts/freight";

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
  let categoryMatched: string | null = null;
  if (f.keyword) {
    const { terms, category } = expandQuery(f.keyword);
    categoryMatched = category;
    // 1) 名称/评语直接命中任一展开词
    const textConds = terms.map(
      (t) => sql`(${factories.name} LIKE ${"%" + t + "%"} OR ${factories.review} LIKE ${"%" + t + "%"})`
    );
    // 2) 类目命中：通过 factory_categories 子查询
    if (category) {
      textConds.push(
        sql`${factories.id} IN (SELECT factory_id FROM factory_categories WHERE category = ${category})`
      );
    }
    conds.push(sql`(${sql.join(textConds, sql` OR `)})`);
  }

  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(60, Math.max(1, f.pageSize ?? 20));
  const where = conds.length ? and(...conds) : undefined;

  // 有搜索词时：名称/评语直接命中的排前面，其余按评分
  const orderBy: SQL[] = [];
  if (f.keyword) {
    orderBy.push(
      sql`(${factories.name} LIKE ${"%" + f.keyword + "%"} OR ${factories.review} LIKE ${"%" + f.keyword + "%"}) DESC`
    );
  }
  orderBy.push(desc(factories.score));

  const [rows, cnt] = await Promise.all([
    db
      .select()
      .from(factories)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ c: sql<number>`count(*)` })
      .from(factories)
      .where(where),
  ]);
  return { rows, total: cnt[0]?.c ?? 0, page, pageSize, category: categoryMatched };
}

function eq2(col: any, val: any) {
  return eq(col, val);
}

const SCORE_DIMS = [
  "qualityCert",
  "factoryPower",
  "trustYears",
  "repurchase",
  "production",
  "service",
  "sales",
] as const;
type ScoreDim = (typeof SCORE_DIMS)[number];

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
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

  // 类目中位数：该厂所属类目下、所有有子分的工厂，逐维取中位数（作为刻度线）
  const catRows = await db
    .select({ category: factoryCategories.category })
    .from(factoryCategories)
    .where(eq(factoryCategories.factoryId, id))
    .limit(1);
  const category = catRows[0]?.category ?? null;
  let categoryMedians: Record<ScoreDim, number | null> | null = null;
  let categoryScoredCount = 0;
  if (category) {
    const peers = await db
      .select({
        qualityCert: factoryScores.qualityCert,
        factoryPower: factoryScores.factoryPower,
        trustYears: factoryScores.trustYears,
        repurchase: factoryScores.repurchase,
        production: factoryScores.production,
        service: factoryScores.service,
        sales: factoryScores.sales,
      })
      .from(factoryScores)
      .innerJoin(
        factoryCategories,
        eq(factoryCategories.factoryId, factoryScores.factoryId)
      )
      .where(eq(factoryCategories.category, category));
    // 源数据大量行子分为 NULL：只统计至少有一维非空的工厂
    const scored = peers.filter((p) =>
      SCORE_DIMS.some((d) => p[d] != null)
    );
    categoryScoredCount = scored.length;
    // 单维样本太少（<5）不出中位线，避免误导
    categoryMedians = Object.fromEntries(
      SCORE_DIMS.map((d) => {
        const vals = scored
          .map((p) => (p[d] != null ? Number(p[d]) : null))
          .filter((v): v is number => v != null);
        return [d, vals.length >= 5 ? median(vals) : null];
      })
    ) as Record<ScoreDim, number | null>;
  }
  return {
    ...rows[0],
    scores: scores[0] ?? null,
    category,
    categoryMedians,
    categoryScoredCount,
  };
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
  destinationCode?: string; // 目的地国家 ISO 码（影响体积重规则与文案）
  exchangeRate?: number; // USD/CNY，默认 7.1
}

const DOMESTIC_FEE = 12; // 国内段集货均价（USD/票）
const dutyOf = () => 0; // 关税预估默认 0，按目的国规则扩展

function channelChargeable(
  channel: "express" | "line" | "sea",
  input: LandedPriceInput,
  hasDims: boolean
) {
  const rule = volumetricRule(channel, input.destinationCode);
  const actualTotal = input.weightKg * input.quantity;
  let volTotal: number | null = null;
  let rawVolTotal: number | null = null;
  if (hasDims) {
    const v =
      ((input.dimCm!.l * input.dimCm!.w * input.dimCm!.h) / rule.divisor) *
      input.quantity;
    rawVolTotal = v;
    // 台/新/马/日专线普货：体积重与实重取平均（协议原文）
    volTotal = rule.avgWithActual ? (v + actualTotal) / 2 : v;
  }
  const chargeable = Math.max(actualTotal, volTotal ?? 0);
  return { rule, actualTotal, volTotal, rawVolTotal, chargeable };
}

function channelTotal(
  channel: "express" | "line" | "sea",
  chargeable: number,
  fixed: { purchaseUsd: number; commissionFee: number }
) {
  const freight = chargeable * CHANNEL_RATE_PER_KG[channel];
  const lastMile = channel === "sea" ? 35 : 21;
  return {
    freight: r2(freight),
    lastMile,
    total: r2(fixed.purchaseUsd + DOMESTIC_FEE + fixed.commissionFee + freight + dutyOf() + lastMile),
  };
}

export async function calcLandedPrice(input: LandedPriceInput) {
  const rate = input.exchangeRate ?? 7.1;
  const purchaseCny = input.unitPriceCny * input.quantity;
  const purchaseUsd = purchaseCny / rate;
  const dest = findDestination(input.destinationCode);

  // 铁律：没填尺寸就不许编尺寸。未提供 dimCm 时按实重计费，并明确标注；
  // 提供后按实重/体积重取大者（台新马日专线为协议特殊平均规则）。
  const hasDims =
    !!input.dimCm && input.dimCm.l > 0 && input.dimCm.w > 0 && input.dimCm.h > 0;

  const cur = channelChargeable(input.channel, input, hasDims);
  const chargeableWeight = cur.chargeable;
  const intlFreight = chargeableWeight * CHANNEL_RATE_PER_KG[input.channel];

  const domestic = DOMESTIC_FEE;
  const lastMile = input.channel === "sea" ? 35 : 21;
  const duty = dutyOf();

  const commission = await calcCommission(purchaseUsd, input.riskTier);

  const destZh = dest ? `发${dest.zh}` : "";
  const freightLabel = !hasDims
    ? `国际运费${destZh}（按实重 ${r2(cur.actualTotal)}kg，未填尺寸）`
    : cur.rule.avgWithActual
      ? `国际运费${destZh}（计费重 ${r2(chargeableWeight)}kg = 体积重 ${r2(cur.rawVolTotal!)} 与实重 ${r2(cur.actualTotal)} 取平均）`
      : `国际运费${destZh}（计费重 ${r2(chargeableWeight)}kg：实重 ${r2(cur.actualTotal)} / 体积重 ${r2(cur.volTotal!)}，取大者）`;

  const lines = [
    {
      key: "factory",
      label: `出厂价（工厂原始报价 ¥${r2(purchaseCny).toLocaleString("zh-CN")}）`,
      amount: r2(purchaseUsd),
    },
    { key: "domestic", label: "国内段运费（工厂→集货仓）", amount: r2(domestic) },
    { key: "commission", label: `履约佣金（${input.riskTier} 档 ${(commission.rate * 100).toFixed(1)}%）`, amount: commission.fee },
    { key: "freight", label: freightLabel, amount: r2(intlFreight) },
    { key: "duty", label: "关税预估", amount: r2(duty) },
    { key: "lastMile", label: "尾程派送", amount: r2(lastMile) },
  ];
  const total = r2(lines.reduce((s, l) => s + l.amount, 0));

  // 老采购渠道建议：三渠道同口径对比 + 推荐（按计费重档位与差价校验）
  const fixed = { purchaseUsd, commissionFee: commission.fee };
  const channels = (["express", "line", "sea"] as const).map((c) => {
    const cc = channelChargeable(c, input, hasDims);
    const t = channelTotal(c, cc.chargeable, fixed);
    return {
      channel: c,
      label: CHANNEL_LABEL[c],
      chargeableKg: r2(cc.chargeable),
      freight: t.freight,
      total: t.total,
      transit: CHANNEL_TRANSIT[c],
    };
  });
  const totalsMap = Object.fromEntries(channels.map((c) => [c.channel, c.total])) as Record<
    "express" | "line" | "sea",
    number
  >;
  const neutralKg = Math.max(...channels.map((c) => c.chargeableKg));
  const rec = recommendChannel(neutralKg, totalsMap);

  return {
    lines,
    total,
    totalCny: r2(total * rate),
    perUnit: r2(total / input.quantity),
    perUnitCny: r2((total * rate) / input.quantity),
    currency: "USD",
    exchangeRate: rate,
    destination: dest ? { code: dest.code, zh: dest.zh } : null,
    volumetricNote: cur.rule.note,
    chargeableWeight: r2(chargeableWeight),
    chargeableBasis: hasDims
      ? cur.volTotal! > cur.actualTotal
        ? ("volumetric" as const)
        : ("actual" as const)
      : ("actual_unsized" as const),
    channelAdvice: {
      recommended: rec.channel,
      recommendedLabel: CHANNEL_LABEL[rec.channel],
      reason: rec.reason,
      compare: channels,
      isCurrentRecommended: rec.channel === input.channel,
    },
    commissionMeta: commission,
  };
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

// ============ AI 选厂推荐（含可解释性：类目排名 + 子分 + 证据）============

export interface MatchedFactory {
  id: number;
  name: string;
  tier: string | null;
  score: number | null;
  years: number | null;
  location: string | null;
  cert: string | null;
  repurchaseRate: number | null;
  mainImage: string | null;
  productImages: string[]; // 产品实拍图（买家先看到货）
  tags: string[];
  reason: string;
  subScores: Record<string, number | null> | null;
  categoryRank: { category: string; rank: number; total: number } | null;
  evidence: string[];
}

export async function matchFactories(intent: {
  keyword?: string;
  location?: string;
  minScore?: number;
  limit?: number;
}): Promise<MatchedFactory[]> {
  // 推荐中立条款（费率矩阵 v1.0 §3.3）：排序仅依据评分与经营指标，工厂不可付费影响
  const category = intent.keyword ? expandQuery(intent.keyword).category : null;
  const res = await findFactories({
    keyword: intent.keyword,
    location: intent.location,
    minScore: intent.minScore ?? 85,
    page: 1,
    pageSize: Math.min(6, Math.max(3, intent.limit ?? 6)),
  });

  const ids = res.rows.map((f) => f.id);
  const db = getDb();

  // 子分明细（7 维）
  const scoreRows = ids.length
    ? await db
        .select()
        .from(factoryScores)
        .where(sql`${factoryScores.factoryId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`,`)})`)
    : [];
  const scoreMap = new Map<number, Record<string, number | null>>(
    scoreRows.map((r) => [
      r.factoryId,
      {
        qualityCert: r.qualityCert != null ? Number(r.qualityCert) : null,
        factoryPower: r.factoryPower != null ? Number(r.factoryPower) : null,
        trustYears: r.trustYears != null ? Number(r.trustYears) : null,
        repurchase: r.repurchase != null ? Number(r.repurchase) : null,
        production: r.production != null ? Number(r.production) : null,
        service: r.service != null ? Number(r.service) : null,
        sales: r.sales != null ? Number(r.sales) : null,
      },
    ])
  );

  // 类目内排名：一次窗口函数算全类目，再在内存里取这 6 家
  let rankMap = new Map<number, { rank: number; total: number }>();
  if (category) {
    const [rankRows]: any = await db.execute(
      sql`SELECT f.id, RANK() OVER (ORDER BY f.score DESC) AS rnk, COUNT(*) OVER () AS total
          FROM factories f JOIN factory_categories c ON c.factory_id = f.id
          WHERE c.category = ${category}`
    );
    for (const r of rankRows as any[]) {
      if (ids.includes(Number(r.id)))
        rankMap.set(Number(r.id), { rank: Number(r.rnk), total: Number(r.total) });
    }
  }

  return res.rows.map((f) => {
    const sub = scoreMap.get(f.id) ?? null;
    const rk = rankMap.get(f.id) ?? null;
    const imgs = (f.images as Record<string, string[]> | null) ?? {};
    // 产品实拍优先；没有产品图的用店铺主图兜底。只保留 http(s) 绝对地址——
    // 源数据里的相对路径图片是原系统本地文件，已随对方服务器丢失
    const abs = (u: string) => /^https?:\/\//i.test(u);
    const productImages = (imgs.product ?? []).filter(abs).slice(0, 3);
    const fallback = productImages.length
      ? productImages
      : f.mainImage && abs(f.mainImage)
        ? [f.mainImage]
        : [];
    return {
      id: f.id,
      name: f.name,
      tier: f.tier,
      score: f.score ? Number(f.score) : null,
      years: f.years ? Number(f.years) : null,
      location: f.location,
      cert: f.cert,
      repurchaseRate: f.repurchaseRate ? Number(f.repurchaseRate) : null,
      mainImage: f.mainImage,
      productImages: fallback,
      tags: (f.tags as string[] | null) ?? [],
      reason: buildReason(f),
      subScores: sub,
      categoryRank: rk && category ? { category, rank: rk.rank, total: rk.total } : null,
      evidence: buildEvidence(f, sub, rk, category),
    };
  });
}

// 推荐证据：每一条都是可核验的事实，不写形容词空话
function buildEvidence(
  f: typeof factories.$inferSelect,
  sub: Record<string, number | null> | null,
  rk: { rank: number; total: number } | null,
  category: string | null
): string[] {
  const ev: string[] = [];
  if (rk && category)
    ev.push(`在「${category}」类目 ${rk.total} 家严选厂中综合排第 ${rk.rank}（前 ${Math.max(1, Math.round((rk.rank / rk.total) * 100))}%）`);
  if (f.score) ev.push(`严选综合评分 ${Number(f.score).toFixed(1)} 分（七维加权，算法公开）`);
  if (f.years && Number(f.years) >= 10) ev.push(`${Number(f.years)} 年持续经营，穿越过多个行业周期`);
  if (f.repurchaseRate && Number(f.repurchaseRate) >= 60)
    ev.push(`老买家复购率 ${Number(f.repurchaseRate)}%，回头客用订单投票`);
  if (f.replyRate && Number(f.replyRate) >= 90) ev.push(`询盘回复率 ${Number(f.replyRate)}%，沟通顺畅`);
  if (f.employeeCount && f.areaSqm)
    ev.push(`自有厂区 ${f.areaSqm.toLocaleString()}㎡、${f.employeeCount} 名员工`);
  else if (f.employeeCount) ev.push(`${f.employeeCount} 名员工`);
  if (f.productCount) ev.push(`在售产品 ${f.productCount} 款，产品线稳定`);
  if (f.oemMode) ev.push(`支持 ${f.oemMode}${f.productionType ? `（${f.productionType}）` : ""}`);
  if (f.serviceCapability) ev.push(`服务能力：${f.serviceCapability}`);
  if (f.monthlyBuyers) ev.push(`月采购买家 ${f.monthlyBuyers} 家，出货活跃`);
  if (f.cert) ev.push(`持第三方认证：${f.cert}`);
  if (f.medal) ev.push(`平台勋章「${f.medal}${f.medalLevel ? ` ${f.medalLevel}` : ""}」`);
  if (f.isSuper) ev.push(`平台超级工厂（实地验厂）`);
  if (sub?.repurchase != null && sub.repurchase >= 90) ev.push(`复购维度子分 ${sub.repurchase}/100，客户粘性极强`);
  if (sub?.qualityCert != null && sub.qualityCert >= 30) ev.push(`质量认证子分满分档`);
  return ev;
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
