import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  int,
  decimal,
  boolean,
  json,
  bigint,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ============ 工厂数据服务（蓝图 v2 §1.3）============

export const factories = mysqlTable(
  "factories",
  {
    id: serial("id").primaryKey(),
    memberId: varchar("member_id", { length: 64 }).notNull(), // 1688 会员 ID，关联钥匙
    slug: varchar("slug", { length: 128 }),
    name: varchar("name", { length: 255 }).notNull(),
    location: varchar("location", { length: 64 }),
    province: varchar("province", { length: 64 }),
    city: varchar("city", { length: 64 }),
    district: varchar("district", { length: 64 }),
    years: decimal("years", { precision: 5, scale: 1 }),
    score: decimal("score", { precision: 5, scale: 1 }), // 严选评分
    tier: mysqlEnum("tier", ["金标", "银标", "铜标", "优选", "培育"]),
    medal: varchar("medal", { length: 64 }),
    medalLevel: varchar("medal_level", { length: 32 }),
    isSuper: boolean("is_super").default(false),
    isPower: boolean("is_power").default(false),
    cert: varchar("cert", { length: 255 }),
    certNote: varchar("cert_note", { length: 255 }),
    employeeCount: int("employee_count"),
    areaSqm: int("area_sqm"),
    replyRate: decimal("reply_rate", { precision: 5, scale: 1 }),
    repurchaseRate: decimal("repurchase_rate", { precision: 5, scale: 1 }),
    monthlyBuyers: int("monthly_buyers"),
    oemMode: varchar("oem_mode", { length: 128 }),
    productionType: varchar("production_type", { length: 128 }),
    serviceCapability: varchar("service_capability", { length: 255 }),
    productCount: int("product_count"),
    home: text("home"), // 1688 店铺链接
    mainImage: text("main_image"), // 主图（本地化后换对象存储 key）
    images: json("images").$type<Record<string, string[]>>(), // 实拍图集：gate/workshop/product/warehouse/equipment/catalog
    review: text("review"), // AI 评语
    tags: json("tags").$type<string[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_factories_member").on(t.memberId),
    index("ix_factories_tier").on(t.tier),
    index("ix_factories_location").on(t.location),
    index("ix_factories_score").on(t.score),
  ]
);

export const factoryScores = mysqlTable(
  "factory_scores",
  {
    id: serial("id").primaryKey(),
    factoryId: bigint("factory_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => factories.id),
    qualityCert: decimal("quality_cert", { precision: 5, scale: 1 }),
    factoryPower: decimal("factory_power", { precision: 5, scale: 1 }),
    trustYears: decimal("trust_years", { precision: 5, scale: 1 }),
    repurchase: decimal("repurchase", { precision: 5, scale: 1 }),
    production: decimal("production", { precision: 5, scale: 1 }),
    service: decimal("service", { precision: 5, scale: 1 }),
    sales: decimal("sales", { precision: 5, scale: 1 }),
    composite: decimal("composite", { precision: 5, scale: 1 }),
    confidence: varchar("confidence", { length: 16 }),
    computedAt: timestamp("computed_at").notNull().defaultNow(),
  },
  (t) => [index("ix_scores_factory").on(t.factoryId)]
);

// 品类风险档（佣金引擎输入，蓝图 v2 §1.3）
export const factoryCategories = mysqlTable(
  "factory_categories",
  {
    id: serial("id").primaryKey(),
    factoryId: bigint("factory_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => factories.id),
    category: varchar("category", { length: 32 }).notNull(),
    source: varchar("source", { length: 32 }).notNull().default("lexicon_v1"),
  },
  (t) => [
    index("ix_fc_factory").on(t.factoryId),
    index("ix_fc_category").on(t.category),
  ]
);

export const categoryRiskTiers = mysqlTable(
  "category_risk_tiers",
  {
    id: serial("id").primaryKey(),
    categoryName: varchar("category_name", { length: 128 }).notNull(),
    platform: varchar("platform", { length: 32 }).notNull().default("1688"),
    riskTier: mysqlEnum("risk_tier", ["A", "B", "C"]).notNull(),
    note: varchar("note", { length: 255 }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_cat_platform").on(t.categoryName, t.platform)]
);

// ============ 佣金规则引擎（费率矩阵 v1.0 已冻结）============

export const commissionRules = mysqlTable(
  "commission_rules",
  {
    id: serial("id").primaryKey(),
    version: varchar("version", { length: 16 }).notNull(), // 费率表版本，如 v1.0
    riskTier: mysqlEnum("risk_tier", ["A", "B", "C"]).notNull(),
    amountFrom: decimal("amount_from", { precision: 12, scale: 2 }).notNull(), // USD
    amountTo: decimal("amount_to", { precision: 12, scale: 2 }), // null = 无上限
    rate: decimal("rate", { precision: 5, scale: 4 }).notNull(), // 0.0350 - 0.1100
    minFee: decimal("min_fee", { precision: 8, scale: 2 }).notNull().default("50.00"),
    effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
    status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),
  },
  (t) => [index("ix_commission_lookup").on(t.version, t.riskTier, t.status)]
);

// ============ AI 采购会话（蓝图 v2 §1.3）============

export const sourcingSessions = mysqlTable(
  "sourcing_sessions",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }), // 后续接 users 表
    queryText: text("query_text").notNull(),
    parsedIntent: json("parsed_intent"),
    recommendedFactoryIds: json("recommended_factory_ids").$type<number[]>(),
    quotes: json("quotes"), // 到手价明细快照
    status: mysqlEnum("status", ["active", "ordered", "closed"])
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_sessions_user").on(t.userId)]
);

// ============ 货源适配层（万邦主力 + 点金灾备，2026-11-03 定案）============

// 商品详情缓存：查过的商品永久沉淀，同一 num_iid 绝不重复花钱
export const offers = mysqlTable(
  "offers",
  {
    id: serial("id").primaryKey(),
    offerId: varchar("offer_id", { length: 32 }).notNull(), // 1688 num_iid
    title: varchar("title", { length: 512 }).notNull(),
    images: json("images").$type<string[]>(),
    priceMin: decimal("price_min", { precision: 10, scale: 2 }),
    priceMax: decimal("price_max", { precision: 10, scale: 2 }),
    priceTiers: json("price_tiers").$type<{ minQty: number; price: number }[]>(),
    moq: int("moq"), // offerBeginAmount 起订量
    sales: int("sales"),
    skus: json("skus").$type<
      { skuId: string | null; specText: string; price: number; listPrice: number | null; stock: number | null; weightKg: number | null }[]
    >(),
    sellerName: varchar("seller_name", { length: 255 }),
    memberId: varchar("member_id", { length: 64 }), // 店铺子域名 = factories.member_id join key
    dispatchHours: int("dispatch_hours"), // 承诺发货小时数
    dispatchNote: varchar("dispatch_note", { length: 255 }),
    unitWeightKg: decimal("unit_weight_kg", { precision: 8, scale: 3 }),
    source: varchar("source", { length: 16 }).notNull(), // wanbang / dianjin / legacy
    status: mysqlEnum("status", ["active", "delisted", "unknown"]).notNull().default("active"),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_offers_offer").on(t.offerId),
    index("ix_offers_member").on(t.memberId),
  ]
);

// 搜索结果缓存：同一关键词+页码 30 分钟内不重查（防刷烧钱）
export const offerSearchCache = mysqlTable(
  "offer_search_cache",
  {
    id: serial("id").primaryKey(),
    query: varchar("query", { length: 255 }).notNull(),
    page: int("page").notNull().default(1),
    total: int("total"),
    items: json("items").$type<
      { offerId: string; title: string; image: string | null; price: number; promotionPrice: number | null; sales: number }[]
    >(),
    source: varchar("source", { length: 16 }).notNull().default("wanbang"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_search_qp").on(t.query, t.page)]
);

// 货源 API 调用台账：每一次真实花钱的调用都记账（供应商/接口/成本/耗时/成败）
export const sourcingApiLogs = mysqlTable(
  "sourcing_api_logs",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider", { length: 16 }).notNull(), // wanbang / dianjin / legacy
    endpoint: varchar("endpoint", { length: 64 }).notNull(), // item_search / item_get_app / 1688xq3 ...
    offerId: varchar("offer_id", { length: 32 }),
    query: varchar("query", { length: 255 }),
    costCny: decimal("cost_cny", { precision: 8, scale: 4 }).notNull().default("0"),
    billed: boolean("billed").notNull().default(true), // 万邦返回2000（含下架）也计费
    ok: boolean("ok").notNull(),
    durationMs: int("duration_ms"),
    error: varchar("error", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_apilogs_created").on(t.createdAt)]
);
