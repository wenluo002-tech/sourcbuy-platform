import { getDb } from "./connection";
import { factories, factoryScores, commissionRules } from "../../db/schema";
import { eq, and, desc, like, gte, lte, sql, type SQL } from "drizzle-orm";
import { expandQuery } from "../../contracts/lexicon";

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
  if (f.medal) ev.push(`1688 ${f.medal}${f.medalLevel ? ` ${f.medalLevel}` : ""}`);
  if (f.isSuper) ev.push(`1688 超级工厂（平台实地验厂）`);
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
