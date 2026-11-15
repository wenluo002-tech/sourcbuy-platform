import { getDb } from "./connection";
import { factories, factoryScores, factoryCategories, commissionRules } from "../../db/schema";
import { eq, and, desc, like, gte, lte, sql, type SQL } from "drizzle-orm";
import { expandQuery, LEXICON } from "../../contracts/lexicon";
import { maskFactory, maskedFactoryName } from "../lib/mask";
import { proxyImageUrl, proxyImageList } from "../lib/imgProxy";
import {
  volumetricRule,
  findDestination,
  recommendChannel,
  CHANNEL_RATE_PER_KG,
  CHANNEL_TRANSIT,
  CHANNEL_LABEL,
} from "../../contracts/freight";
import { quoteFreight } from "./freightQuote";
import { findRealChannel, channelsForCountry } from "../../contracts/freightRates";
import { FX_SETTLEMENT } from "../../contracts/fx";

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
  unlocked?: boolean; // 权益锁：首单付款用户看真名，其余访客看代号（2026-11-07 罗总授权）
}

export async function findFactories(f: FactoryFilter) {
  const db = getDb();
  const conds: SQL[] = [];
  // 贸易商/供应链公司不是源头工厂：AI 匹配与工厂列表一律排除（2026-11-06 罗总授权清理，108 家）
  conds.push(sql`${factories.isTrader} = 0`);
  // 同一公司多店铺账号只保留最高分店铺（dup_of 指向保留者），推荐位不浪费在重复公司上（2026-11-06 深度体检）
  conds.push(sql`${factories.dupOf} IS NULL`);
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
  // v90 补漏：列表出口同样过图片代理（v89 只覆盖了 match/detail 等六处，此处漏网）
  return { rows: rows.map((r) => { const m = maskFactory(r, !!f.unlocked); if (m.mainImage) m.mainImage = proxyImageUrl(m.mainImage); return m; }), total: cnt[0]?.c ?? 0, page, pageSize, category: categoryMatched };
}

function eq2(col: any, val: any) {
  return eq(col, val);
}

// 评分体系 v2（2026-11-12 推翻重建）：六维逻辑键 → factory_scores 物理列
// factory_power / service 是旧 7 维遗留列，不再读取
const SCORE_DIMS = ["cert", "audit", "rep", "year", "sales", "prod"] as const;
type ScoreDim = (typeof SCORE_DIMS)[number];

const DIM_SELECT = {
  cert: factoryScores.qualityCert,
  audit: factoryScores.audit,
  rep: factoryScores.repurchase,
  year: factoryScores.trustYears,
  sales: factoryScores.sales,
  prod: factoryScores.production,
} as const;

function toScoreDims(r: Record<string, unknown>): Record<ScoreDim, number | null> {
  const num = (v: unknown) => (v != null ? Number(v) : null);
  return {
    cert: num(r.qualityCert),
    audit: num(r.audit),
    rep: num(r.repurchase),
    year: num(r.trustYears),
    sales: num(r.sales),
    prod: num(r.production),
  };
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function findFactoryById(id: number, unlocked = false) {
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
      .select(DIM_SELECT)
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
    ...maskFactory(rows[0], unlocked)!,
    // 权益锁图片旁路修复（2026-11-15）：实拍图 URL 含上游卖家身份段，一律走代理改写，原始地址不下发
    mainImage: proxyImageUrl(rows[0].mainImage),
    images: Object.fromEntries(
      Object.entries(((rows[0].images as Record<string, unknown> | null) ?? {})).map(([k, v]) => [k, proxyImageList(v)])
    ),
    // 只暴露 v2 六维 + 综合分/置信度；旧 7 维遗留列不下发
    scores: scores[0]
      ? {
          ...toScoreDims(scores[0]),
          composite: scores[0].composite != null ? Number(scores[0].composite) : null,
          confidence: scores[0].confidence ?? null,
        }
      : null,
    category,
    categoryMedians,
    categoryScoredCount,
  };
}

export async function factoryStats() {
  const db = getDb();
  // 统计口径排除贸易商（is_trader=1）与重复店铺（dup_of 非空），前台"严选工厂数"只算真实独立工厂
  const NOT_DUP = sql`${factories.isTrader} = 0 AND ${factories.dupOf} IS NULL`;
  const byTier = await db
    .select({ tier: factories.tier, c: sql<number>`count(*)` })
    .from(factories)
    .where(NOT_DUP)
    .groupBy(factories.tier);
  const total = await db.select({ c: sql<number>`count(*)` }).from(factories).where(NOT_DUP);
  const locations = await db
    .select({ location: factories.location, c: sql<number>`count(*)` })
    .from(factories)
    .where(NOT_DUP)
    .groupBy(factories.location)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
  return { byTier, total: total[0]?.c ?? 0, topLocations: locations };
}

// 品类覆盖：各类目下的独立工厂数（同口径排除贸易商/重复店），一厂可多类目
export async function factoryCategoryStats() {
  const db = getDb();
  const NOT_DUP = sql`${factories.isTrader} = 0 AND ${factories.dupOf} IS NULL`;
  const byCategory = await db
    .select({ category: factoryCategories.category, c: sql<number>`count(distinct ${factoryCategories.factoryId})` })
    .from(factoryCategories)
    .innerJoin(factories, eq(factoryCategories.factoryId, factories.id))
    .where(NOT_DUP)
    .groupBy(factoryCategories.category)
    .orderBy(desc(sql`count(distinct ${factoryCategories.factoryId})`));
  const tagged = await db
    .select({ c: sql<number>`count(distinct ${factoryCategories.factoryId})` })
    .from(factoryCategories)
    .innerJoin(factories, eq(factoryCategories.factoryId, factories.id))
    .where(NOT_DUP);
  const total = await db.select({ c: sql<number>`count(*)` }).from(factories).where(NOT_DUP);
  return { byCategory, tagged: tagged[0]?.c ?? 0, total: total[0]?.c ?? 0 };
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

// 佣金费率表（v1.0 冻结矩阵，全量 12 行）——前端结果卡"服务费拆解行"的单一事实源
export async function listCommissionRules() {
  const db = getDb();
  const rules = await db
    .select()
    .from(commissionRules)
    .where(and(eq(commissionRules.version, "v1.0"), eq(commissionRules.status, "active")));
  return rules.map((r) => ({
    riskTier: r.riskTier as "A" | "B" | "C",
    amountFrom: Number(r.amountFrom),
    amountTo: r.amountTo === null ? null : Number(r.amountTo),
    rate: Number(r.rate),
    minFee: Number(r.minFee),
    version: r.version,
  }));
}

// ============ 到手价试算（蓝图 §5.5）============

export interface LandedPriceInput {
  unitPriceCny: number; // 出厂单价
  quantity: number;
  weightKg: number; // 单件实重
  dimCm?: { l: number; w: number; h: number }; // 单件尺寸
  riskTier: "A" | "B" | "C";
  channel: string; // 真实渠道 id（freightRates）或 generic: express/line/sea
  destinationCode?: string; // 目的地国家 ISO 码
  zip?: string; // 邮编（美国 5 位 / 澳洲 4 位，分区报价用）
  caRegion?: string; // 加拿大海运派送区域
  cargoType?: string; // 货物属性（触发品类附加费/黑名单）
  residential?: boolean; // 私人住宅地址
  exchangeRate?: number; // USD/CNY 结汇汇率，默认 FX_SETTLEMENT（牌价−0.3，见 contracts/fx.ts）
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
  const rate = input.exchangeRate ?? FX_SETTLEMENT;
  const purchaseCny = input.unitPriceCny * input.quantity;
  const purchaseUsd = purchaseCny / rate;
  const dest = findDestination(input.destinationCode);
  const cargoType = input.cargoType ?? "general";
  const commission = await calcCommission(purchaseUsd, input.riskTier);
  const toUsd = (cny: number) => r2(cny / rate);

  // 自动模式：用户不分渠道，同国全部真实渠道同口径对比，直接落到最便宜的一条；
  // 全部不可报价时不静默降级，把第一条的拦截原因抛出来（如黑名单/人工单询）
  let channelId = input.channel;
  if (channelId === "auto" && input.destinationCode) {
    const candidates = channelsForCountry(input.destinationCode);
    let bestId: string | null = null;
    let bestTotal = Infinity;
    let firstError: string | null = null;
    let firstManual = false;
    for (const c of candidates) {
      const cq = quoteFreight({
        channelId: c.id, destinationCode: input.destinationCode,
        zip: input.zip, caRegion: input.caRegion, cargoType,
        residential: input.residential, quantity: input.quantity,
        weightKg: input.weightKg, dimCm: input.dimCm,
      });
      if (cq.ok) {
        if (cq.totalCny < bestTotal) { bestTotal = cq.totalCny; bestId = c.id; }
      } else if (!firstError) {
        firstError = cq.error ?? "不可报价";
        firstManual = !!cq.manualOnly;
      }
    }
    if (bestId) channelId = bestId;
    else if (firstError) throw new Error(firstManual ? `人工单询：${firstError}` : firstError);
    else channelId = "line"; // 该国无真实价卡，走通用估算
  }

  // ============ 真实报价渠道（2026-10-15 价卡，CNY 计费折算 USD）============
  const realCh = findRealChannel(channelId);
  if (realCh) {
    const q = quoteFreight({
      channelId: realCh.id,
      destinationCode: input.destinationCode ?? "",
      zip: input.zip,
      caRegion: input.caRegion,
      cargoType,
      residential: input.residential,
      quantity: input.quantity,
      weightKg: input.weightKg,
      dimCm: input.dimCm,
    });
    if (!q.ok) {
      throw new Error(q.manualOnly ? `人工单询：${q.error}` : q.error ?? "该渠道暂不可报价");
    }

    const freightUsd = toUsd(q.freightCny);
    const lines = [
      {
        key: "factory",
        label: `出厂价（工厂原始报价 ¥${r2(purchaseCny).toLocaleString("zh-CN")}）`,
        amount: r2(purchaseUsd),
      },
      { key: "domestic", label: "国内段运费（工厂→集货仓）", amount: r2(DOMESTIC_FEE) },
      { key: "commission", label: `履约佣金（${input.riskTier} 档 ${(commission.rate * 100).toFixed(1)}%）`, amount: commission.fee },
      {
        key: "freight",
        label: `国际运费 · ${q.channelName}（${q.pricePerKgCny != null ? `¥${q.pricePerKgCny}/kg × ${q.chargeableKg}kg` : "首续重计费"}）`,
        amount: freightUsd,
      },
      ...q.surcharges.map((s, i) => ({
        key: `surcharge_${i}`,
        label: s.label,
        amount: toUsd(s.amountCny),
      })),
      { key: "duty", label: q.ddp ? "关税（DDP 渠道包税）" : "关税预估", amount: 0 },
      { key: "lastMile", label: q.ddp ? "尾程派送（DDP 渠道含派送）" : "尾程派送", amount: q.ddp ? 0 : 21 },
    ];
    const total = r2(lines.reduce((s, l) => s + l.amount, 0));

    // 同目的地所有真实渠道对比（与明细行同一口径：各项先舍入再求和，保证卡片数与逐行之和分毫不差）
    const compare = channelsForCountry(input.destinationCode ?? "")
      .map((c) => {
        const cq = quoteFreight({
          channelId: c.id, destinationCode: input.destinationCode ?? "",
          zip: input.zip, caRegion: input.caRegion, cargoType,
          residential: input.residential, quantity: input.quantity,
          weightKg: input.weightKg, dimCm: input.dimCm,
        });
        if (!cq.ok) return { channelId: c.id, channelName: c.name, ok: false as const, reason: cq.error ?? "不可报价", manualOnly: !!cq.manualOnly, mode: c.mode, speedTag: c.speedTag ?? null, transitNote: c.transitNote };
        const totalUsd = r2(
          r2(purchaseUsd) + r2(DOMESTIC_FEE) + commission.fee + toUsd(cq.freightCny) +
          cq.surcharges.reduce((s, x) => s + toUsd(x.amountCny), 0) + (cq.ddp ? 0 : 21),
        );
        return { channelId: c.id, channelName: c.name, ok: true as const, mode: c.mode, speedTag: c.speedTag ?? null, transitNote: c.transitNote, chargeableKg: cq.chargeableKg, freightUsd: toUsd(cq.freightCny), totalUsd };
      });
    const quotable = compare.filter((c) => c.ok);
    const cheapest = quotable.length ? quotable.reduce((a, b) => (a.totalUsd <= b.totalUsd ? a : b)) : null;
    const fastestAir = quotable.filter((c) => c.mode === "air").sort((a, b) => a.totalUsd - b.totalUsd)[0] ?? null;
    let adviceReason = "";
    if (cheapest) {
      adviceReason = `到手价最低的是${cheapest.channelName}（$${cheapest.totalUsd.toFixed(2)}）`;
      if (fastestAir && fastestAir.channelId !== cheapest.channelId) {
        adviceReason += `；要快选${fastestAir.channelName}（$${fastestAir.totalUsd.toFixed(2)}，${fastestAir.transitNote}），贵 $${(fastestAir.totalUsd - cheapest.totalUsd).toFixed(0)}`;
      }
    }

    return {
      lines,
      total,
      totalCny: r2(total * rate),
      perUnit: r2(total / input.quantity),
      perUnitCny: r2((total * rate) / input.quantity),
      currency: "USD",
      exchangeRate: rate,
      destination: dest ? { code: dest.code, zh: dest.zh } : null,
      volumetricNote: q.basisNote,
      chargeableWeight: q.chargeableKg,
      chargeableBasis: "real_channel" as const,
      realChannel: {
        id: q.channelId, name: q.channelName, ddp: q.ddp, transitNote: q.transitNote,
        pricePerKgCny: q.pricePerKgCny, priceVersion: "2026-10-15 价卡",
      },
      freightWarnings: q.warnings,
      channelAdvice: {
        recommended: cheapest?.channelId ?? q.channelId,
        recommendedLabel: cheapest?.channelName ?? q.channelName,
        reason: adviceReason,
        isCurrentRecommended: cheapest?.channelId === q.channelId,
        compare: quotable.map((c) => ({
          channel: c.channelId, label: c.channelName, chargeableKg: c.chargeableKg,
          freight: c.freightUsd, total: c.totalUsd, transit: c.transitNote,
          mode: c.mode, speedTag: c.speedTag,
        })),
        unavailable: compare.filter((c) => !c.ok).map((c) => ({ label: c.channelName, reason: c.reason })),
      },
      commissionMeta: commission,
    };
  }

  // ============ 通用估算渠道（未接入真实价卡的国家）============
  const genericChannel = (["express", "line", "sea"].includes(input.channel) ? input.channel : "line") as "express" | "line" | "sea";
  const hasDims =
    !!input.dimCm && input.dimCm.l > 0 && input.dimCm.w > 0 && input.dimCm.h > 0;

  const cur = channelChargeable(genericChannel, input, hasDims);
  const chargeableWeight = cur.chargeable;
  const intlFreight = chargeableWeight * CHANNEL_RATE_PER_KG[genericChannel];

  const domestic = DOMESTIC_FEE;
  const lastMile = genericChannel === "sea" ? 35 : 21;
  const duty = dutyOf();

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
      mode: (c === "sea" ? "sea" : "air") as "air" | "sea",
      speedTag: null as string | null,
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
    realChannel: null,
    freightWarnings: [] as string[],
    channelAdvice: {
      recommended: rec.channel,
      recommendedLabel: CHANNEL_LABEL[rec.channel],
      reason: rec.reason,
      isCurrentRecommended: rec.channel === genericChannel,
      compare: channels,
      unavailable: [] as Array<{ label: string; reason: string }>,
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
  masked?: boolean; // 权益锁：true=厂名为代号，首单付款后解锁完整档案
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
  // productLinked=该厂在严选库且有这款的在售货源（以货带厂，最硬证据）；
  // direct=名称/评语/标签明确含这类产品词；bucket=仅大类桶成员，未核实做这款
  matchBasis: "productLinked" | "direct" | "bucket";
  linkedOffer: { offerId: string; title: string; price: number; sales: number } | null; // productLinked 时在售货快照
  categoryRank: { category: string; rank: number; total: number } | null;
  evidence: string[];
}

export async function matchFactories(intent: {
  keyword?: string;
  location?: string;
  minScore?: number;
  limit?: number;
  unlocked?: boolean; // 权益锁：false=厂名以代号输出（查询匹配仍用真名，仅在出口处遮罩）
}): Promise<MatchedFactory[]> {
  // 推荐中立条款（费率矩阵 v1.0 §3.3）：排序仅依据评分与经营指标，工厂不可付费影响
  const category = intent.keyword ? expandQuery(intent.keyword).category : null;
  // 买家显式指定地区时门槛放宽到 75：买家自己做了第一道筛选，我们的职责是在该地区内按分数取最优并如实展示，
  // 而不是用全国统一 85 分线把该地区卡成空白（2026-11-06 中山演示前修复：中山灯饰金标厂 83.9 分会被 85 线卡没）
  const res = await findFactories({
    keyword: intent.keyword,
    location: intent.location,
    minScore: intent.minScore ?? (intent.location ? 75 : 85),
    page: 1,
    pageSize: Math.min(6, Math.max(3, intent.limit ?? 6)),
  });

  const ids = res.rows.map((f) => f.id);
  const db = getDb();

  // 子分明细（v2 六维）
  const scoreRows = ids.length
    ? await db
        .select()
        .from(factoryScores)
        .where(sql`${factoryScores.factoryId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`,`)})`)
    : [];
  const scoreMap = new Map<number, Record<string, number | null>>(
    scoreRows.map((r) => [r.factoryId, toScoreDims(r)])
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

  // 直接证据词 = 查询词本身 + 该类目的具体产品词（"耳机/衣架/保温杯"这种）
  // 不用类目通用词（"科技/电子/智能"）——中国厂名一半带"科技"，皮带厂也能混进电子数码桶（v46 耳机→皮带厂事故）
  const catProducts = category && LEXICON[category] ? LEXICON[category].products : [];
  const directTerms = [...new Set([...(intent.keyword ? [intent.keyword] : []), ...catProducts])].filter((t) => t.length >= 2);
  const hasDirectEvidence = (f: (typeof res.rows)[number]): boolean => {
    const blob = `${f.name} ${f.review ?? ""} ${Array.isArray(f.tags) ? (f.tags as string[]).join(" ") : ""}`;
    return directTerms.some((t) => blob.includes(t));
  };

  return res.rows
    .map((f) => {
      const direct = hasDirectEvidence(f);
      return { f, direct };
    })
    .sort((a, b) => Number(b.direct) - Number(a.direct)) // 有直接证据的排前，桶内高分但没证据的沉底
    .map(({ f, direct }) => {
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
      name: intent.unlocked ? f.name : maskedFactoryName(f.id),
      masked: !intent.unlocked,
      tier: f.tier,
      score: f.score ? Number(f.score) : null,
      years: f.years ? Number(f.years) : null,
      location: f.location,
      cert: f.cert,
      repurchaseRate: f.repurchaseRate ? Number(f.repurchaseRate) : null,
      mainImage: proxyImageUrl(f.mainImage),
      productImages: fallback.map((u) => proxyImageUrl(u)), // 代理改写：URL 不再含上游卖家身份段
      tags: (f.tags as string[] | null) ?? [],
      reason: buildReason(f),
      subScores: sub,
      matchBasis: direct ? ("direct" as const) : ("bucket" as const), // direct=名称/评语/标签含具体产品词；bucket=仅大类桶成员，没核实做这款
      linkedOffer: null, // productLinked 档由 aiSourcing 以货带厂后注入
      categoryRank: direct && rk && category ? { category, rank: rk.rank, total: rk.total } : null, // 桶排名只给有直接证据的厂——皮带厂顶着"电子数码第 1"是误导
      evidence: buildEvidence(f, sub, direct ? rk : null, direct ? category : null),
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
  if (sub?.rep != null && sub.rep >= 85) ev.push(`复购维度 ${sub.rep}/100，老买家持续回头`);
  if (sub?.cert != null && sub.cert >= 90) ev.push(`资质认证维度 ${sub.cert}/100，持知名第三方认证`);
  if (sub?.audit != null && sub.audit >= 90) ev.push(`已完成深度验厂，实地核验维度满分档`);
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

// ============ 供应商数字护照 v1（2026-11-08 战略解码落地）============
// 五段式结构化档案：身份/能力/证据/商业条件/状态——Agent 可读的供应商最小决策集合。
// 纪律：①未解锁买家身份段只给代号（maskFactory 同款口径）；②没有的段诚实标 null/unavailable，绝不凑数；
//      ③每个字段附"有/无"，让调用方知道哪些是核实过的、哪些还缺。
export async function getFactoryPassport(id: number, unlocked = false) {
  const db = getDb();
  const rows = await db.select().from(factories).where(eq(factories.id, id)).limit(1);
  const f = rows[0];
  if (!f || f.isTrader || f.dupOf) return null; // 贸易商/重复店铺不出护照（与列表口径一致）

  const imgs = (f.images ?? {}) as Record<string, string[]>;
  const photoCount = Object.values(imgs).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
  const has = (v: unknown) => v != null && v !== "" && v !== 0;

  return {
    version: "passport.v1",
    factoryId: f.id,
    identity: {
      name: unlocked ? f.name : maskedFactoryName(f.id), // 权益锁：未首单只见代号
      verified: unlocked,
      location: f.location ?? null,
      province: f.province ?? null,
      city: f.city ?? null,
      tier: f.tier,
      score: f.score != null ? Number(f.score) : null,
      storeYears: f.years != null ? Number(f.years) : null, // 诚信通店铺年限（≠成立年份）
      isSuper: !!f.isSuper,
      deepInspected: !!f.deepInspected,
    },
    capability: {
      cert: f.cert ?? null,
      certNote: f.certNote ?? null,
      oemMode: f.oemMode ?? null,
      productionType: f.productionType ?? null,
      employeeCount: has(f.employeeCount) ? f.employeeCount : null,
      areaSqm: has(f.areaSqm) ? f.areaSqm : null,
      monthlyBuyers: has(f.monthlyBuyers) ? f.monthlyBuyers : null,
      repurchaseRate: f.repurchaseRate != null ? Number(f.repurchaseRate) : null,
      productCount: f.productCount ?? null,
      tags: (f.tags ?? []) as string[],
    },
    evidence: {
      realPhotoCount: photoCount, // 实拍图张数（大门/车间/产品/仓库/设备/名录六类）
      hasReview: !!f.review,
      serviceCapability: f.serviceCapability ?? null,
      auditReports: [] as string[], // 验厂报告：待线下验厂体系接入，现在为空是诚实状态
    },
    terms: null as null, // 商业条件（报价逻辑/账期/赔付条款）：未沉淀，v1 不提供，绝不编造
    status: {
      available: false, // 实时产能占用：当前无数据源，显式标记不可用
      note: "realtime_capacity_unavailable",
    },
    completeness: {
      // 档案完备度：六个关键字段已核实几个——调用方据此判断这本护照能撑多重的决策
      filled: [f.cert, f.oemMode, f.productionType, f.employeeCount, f.areaSqm, f.monthlyBuyers].filter(has).length,
      of: 6,
    },
  };
}
