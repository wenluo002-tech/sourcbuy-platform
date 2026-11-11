import { sql as dsql } from "drizzle-orm";
import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  datetime,
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
    deepInspected: boolean("deep_inspected"), // 深度验厂徽章（1=有，NULL=未采集到，只写正向）
    cert: varchar("cert", { length: 255 }),
    certNote: varchar("cert_note", { length: 255 }),
    employeeCount: int("employee_count"),
    areaSqm: int("area_sqm"),
    replyRate: decimal("reply_rate", { precision: 5, scale: 1 }),
    repurchaseRate: decimal("repurchase_rate", { precision: 5, scale: 1 }),
    monthlyBuyers: int("monthly_buyers"),
    near90dSales: varchar("near90d_sales", { length: 32 }), // 卡片原生「近90天销量」原样字符串（如 "100+"/"1万+"），绝不叫月买家数、绝不换算
    oemMode: varchar("oem_mode", { length: 128 }),
    productionType: varchar("production_type", { length: 128 }),
    serviceCapability: varchar("service_capability", { length: 255 }),
    productCount: int("product_count"),
    home: text("home"), // 1688 店铺链接
    mainImage: text("main_image"), // 主图（本地化后换对象存储 key）
    images: json("images").$type<Record<string, string[]>>(), // 实拍图集：gate/workshop/product/warehouse/equipment/catalog
    isTrader: boolean("is_trader").notNull().default(false), // 贸易商/供应链公司标记：不是源头工厂，AI 匹配与工厂列表排除（2026-11-06 罗总授权清理）
    dupOf: bigint("dup_of", { mode: "number", unsigned: true }), // 同一公司多店铺账号时指向保留的高分店 id；非空即隐藏（2026-11-06 深度体检）
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
      { skuId: string | null; specText: string; price: number | null; listPrice: number | null; stock: number | null; weightKg: number | null; image: string | null }[]
    >(),
    specImages: json("spec_images").$type<Record<string, string>>(), // 第一维规格值→图片 URL
    sellerName: varchar("seller_name", { length: 255 }),
    memberId: varchar("member_id", { length: 64 }), // 1688 会员 ID（b2b-xxx）= factories.member_id join key 之一
    sellerLoginId: varchar("seller_login_id", { length: 64 }), // 会员登录名（老格式）= join key 之二
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

// 产品池（长期资产，v48）：每次真实搜索的在售货源逐条沉淀，同一 offerId 只存一行。
// 与 offer_search_cache（30min 防刷层）的分工：缓存层防重复烧钱，产品池做跨查询复用与"以货带厂"——
// 池子里的每条货都可能通过 memberId join 上严选库工厂，构成"这家厂就在卖这款"的最硬证据。
export const offerPool = mysqlTable(
  "offer_pool",
  {
    id: serial("id").primaryKey(),
    offerId: varchar("offer_id", { length: 32 }).notNull(), // 1688 num_iid
    title: varchar("title", { length: 512 }).notNull(),
    image: text("image"),
    price: decimal("price", { precision: 10, scale: 2 }),
    promotionPrice: decimal("promotion_price", { precision: 10, scale: 2 }),
    sales: int("sales").notNull().default(0), // 上游搜索级销量（取历史最大值）
    memberId: varchar("member_id", { length: 64 }), // 1688 会员 ID（b2b-xxx）→ join factories
    sellerLoginId: varchar("seller_login_id", { length: 64 }), // 会员登录名（老格式）→ join factories 兜底
    sellerUserId: varchar("seller_user_id", { length: 32 }), // 卖家数字 userId（图片 CDN "!!{userId}" 零成本提取）→ b2b-{userId}% 前缀 join
    detailFetchedAt: timestamp("detail_fetched_at"), // memberId 的数据时间
    hitCount: int("hit_count").notNull().default(1), // 被不同搜索词命中次数（热度信号）
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_pool_offer").on(t.offerId),
    index("ix_pool_sales").on(t.sales),
    index("ix_pool_member").on(t.memberId),
    index("ix_pool_login").on(t.sellerLoginId),
    index("ix_pool_uid").on(t.sellerUserId),
    index("ix_pool_lastseen").on(t.lastSeenAt),
  ]
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

// ============ 海外爆款雷达（选品台信号层）============
// 每条 = 一个"海外有真实热度信号 + 国内工厂能造"的品。
// 信号必须真实可溯源（来源/日期/链接），价格带来自上游实时搜索，不编数据。
export const radarItems = mysqlTable(
  "radar_items",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 128 }).notNull(), // 中文品名，如"植绒防滑衣架"
    titleEn: varchar("title_en", { length: 255 }), // 海外对应品名
    keyword: varchar("keyword", { length: 128 }).notNull(), // 上游搜货关键词
    signalSource: mysqlEnum("signal_source", ["amazon", "tiktok"]).notNull(),
    signalText: varchar("signal_text", { length: 255 }).notNull(), // "亚马逊美国站家居厨畅销榜 #1"
    signalUrl: text("signal_url"), // 买家可点击验证的链接
    signalDate: varchar("signal_date", { length: 16 }).notNull(), // 信号采集日期 YYYY-MM-DD
    imageUrl: varchar("image_url", { length: 512 }), // 产品代表图（上游搜索首图，外链直用）
    retailPriceUsd: decimal("retail_price_usd", { precision: 8, scale: 2 }), // 海外零售价（信号来源标价）
    factoryPriceMin: decimal("factory_price_min", { precision: 8, scale: 2 }), // 出厂价带（上游实时搜索）
    factoryPriceMax: decimal("factory_price_max", { precision: 8, scale: 2 }),
    upstreamCount: int("upstream_count"), // 上游在售货源数
    vettedCount: int("vetted_count").notNull().default(0), // 严选库命中工厂数
    topSales: int("top_sales"), // 上游头部在售量（参考）
    note: text("note"), // 老采购一句话点评（含风险/认证提示）
    trendDirection: varchar("trend_direction", { length: 12 }), // Google Trends 人工标注：rising/flat/falling，无值不显示（不编数据）
    trendCheckedAt: varchar("trend_checked_at", { length: 16 }), // 趋势检查日期 YYYY-MM-DD
    sortOrder: int("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ix_radar_active").on(t.active, t.sortOrder)]
);

// ============ M3a 账号体系 + 会话记忆（2026-11-05 罗总批准开工）============
// 买家账号：目标客户是海外中小 B 端买家，用邮箱+密码（scrypt），不用手机号。
export const users = mysqlTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 191 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 64 }),
    locale: varchar("locale", { length: 8 }), // 显式选择的语言，登录后跨设备跟随
    role: varchar("role", { length: 16 }).default("buyer"), // M5：buyer/ops，ops 白名单见 middleware.isOpsEmail
    attr: json("attr"), // M5 首次接触归因快照 {source,medium,campaign,referrer,landing,at}，注册时只写一次
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at"),
  },
  (t) => [uniqueIndex("uq_users_email").on(t.email)]
);

// 登录态：cookie 里是原始 token，库里只存 sha256——库泄露也换不出会话
export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: serial("id").primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_auth_token").on(t.tokenHash), index("ix_auth_user").on(t.userId)]
);

// 会话：匿名期用 anonId（浏览器 localStorage），登录后 claim 到 userId——对话跟着人走
export const chatThreads = mysqlTable(
  "chat_threads",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }),
    anonId: varchar("anon_id", { length: 36 }),
    title: varchar("title", { length: 255 }),
    locale: varchar("locale", { length: 8 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ix_threads_user").on(t.userId, t.updatedAt), index("ix_threads_anon").on(t.anonId, t.updatedAt)]
);

// 消息：卡片数据（商品墙/工厂卡/追问卡/单品卡）原样快照进 payload，回放不重新花钱查询
export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    threadId: bigint("thread_id", { mode: "number", unsigned: true }).notNull(),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    content: text("content").notNull(),
    payload: json("payload"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_msgs_thread").on(t.threadId, t.id)]
);

// ============ M3b 订单状态机（2026-11-05 罗总指示开工）============
// 状态机冻结口径：询价 → 已报价 → 待付款（支付挂"即将开通"诚实标注）→ 采购中 → 质检 → 发货 → 收货
// 状态流转全部留痕进 order_events（谁转的、什么时候、备注），可审计，不覆写历史
export const orders = mysqlTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNo: varchar("order_no", { length: 24 }).notNull(), // 展示编号 SB260105-XXXX
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(), // 订单必须挂账号——询价即建档
    threadId: bigint("thread_id", { mode: "number", unsigned: true }), // 来源会话（可追溯当时聊了什么）
    offerId: varchar("offer_id", { length: 32 }), // 关联货源货号（可空：纯文字描述的需求）
    productTitle: varchar("product_title", { length: 512 }),
    productImage: varchar("product_image", { length: 1024 }),
    quantity: int("quantity"),
    destination: varchar("destination", { length: 128 }),
    demand: text("demand"), // 买家原话需求
    status: mysqlEnum("status", ["inquiry", "quoted", "pending_payment", "sourcing", "producing", "goods_ready", "insp1_uploading", "insp1_review", "insp1_passed", "shipped", "in_warehouse", "insp2_review", "insp2_passed", "awaiting_phase2_pay", "phase2_paid", "dispatched", "received", "cancelled"]).notNull().default("inquiry"), // 完整 17+1 态见 contracts/orderFlow.ts（2026-11-09 双检扩展）
    quote: json("quote"), // 报价单快照：出厂价/运费/关税/佣金/总额/汇率/渠道/时效/报价时间——报价一旦给出就是快照，不随后台数据漂移
    acceptedAt: datetime("accepted_at", { fsp: 3 }), // M5：接受报价时点（GMV 口径 on_accept 的入账点，只写一次）
    gmvUsd: decimal("gmv_usd", { precision: 12, scale: 2 }), // M5：接受报价时的 totalUsd 快照，口径切换可重算
    attr: json("attr"), // M5 末次接触归因快照（落空回落注册首次归因）
    decisionTags: json("decision_tags").$type<string[]>(), // 买家确认报价时的选择理由（价格/交期/样品/验厂/沟通/其他）——决策上下文核心资产
    decisionNote: varchar("decision_note", { length: 255 }), // 选择理由可选补充（买家原话）
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_orders_no").on(t.orderNo), index("ix_orders_user").on(t.userId, t.updatedAt)]
);

export const orderEvents = mysqlTable(
  "order_events",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("order_id", { mode: "number", unsigned: true }).notNull(),
    fromStatus: varchar("from_status", { length: 24 }), // 首单创建时 from=null
    toStatus: varchar("to_status", { length: 24 }).notNull(),
    actor: mysqlEnum("actor", ["buyer", "ops", "system"]).notNull(),
    note: varchar("note", { length: 512 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_oevents_order").on(t.orderId, t.id)]
);

// ============ M4a 买家后台（采购工作台）============
// 收货地址簿：DDP 到门履约的结构化地址刚需；海外买家，字段按国际地址习惯（州/省州在 city 前）
export const addresses = mysqlTable(
  "addresses",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    label: varchar("label", { length: 64 }), // 标签：公司 / 仓库 / 门店
    contactName: varchar("contact_name", { length: 128 }).notNull(),
    phone: varchar("phone", { length: 64 }).notNull(),
    country: varchar("country", { length: 64 }).notNull(),
    state: varchar("state", { length: 128 }), // 州/省（美加澳必填，其他国家可空）
    city: varchar("city", { length: 128 }),
    address1: varchar("address1", { length: 255 }).notNull(), // 街道门牌
    address2: varchar("address2", { length: 255 }), // 公寓/楼层/套房
    postcode: varchar("postcode", { length: 32 }),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ix_addr_user").on(t.userId, t.isDefault)]
);

// 消息中心：报价好了/订单变状态/系统通知；readAt 空=未读
export const notifications = mysqlTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    type: varchar("type", { length: 32 }).notNull(), // order_status / quote_ready / system
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    link: varchar("link", { length: 255 }), // 站内跳转路径
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_notif_user").on(t.userId, t.readAt), index("ix_notif_created").on(t.userId, t.createdAt)]
);

// ============ 买侧上下文资产（2026-11-08 姚顺雨×张亚勤对谈战略解码落地）============

// 推荐证据链：每次 AI 推荐落盘"基于什么推了什么"——推荐命中率的统计基础、纠纷时的举证依据、可回放
export const recommendationLogs = mysqlTable(
  "recommendation_logs",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }), // 可空：匿名会话
    threadId: bigint("thread_id", { mode: "number", unsigned: true }),
    message: varchar("message", { length: 500 }), // 买家原话（截断）
    intentProduct: varchar("intent_product", { length: 128 }),
    intentQuantity: int("intent_quantity"),
    intentDestination: varchar("intent_destination", { length: 64 }),
    factories: json("factories").$type<Array<Record<string, unknown>>>(), // 推荐快照精简版：id/tier/score/matchBasis/linkedOfferId
    productsCount: int("products_count"),
    hadLink: boolean("had_link").default(false), // 是否贴了外部链接
    hadImage: boolean("had_image").default(false),
    factoryQa: boolean("factory_qa").default(false), // 是否触发"问到即采"
    adoptedOfferId: varchar("adopted_offer_id", { length: 32 }), // 以后回写：买家最终下单的货源
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_reclog_user").on(t.userId, t.createdAt), index("ix_reclog_created").on(t.createdAt)]
);

// 买家画像：从询价/订单行为自动推断（绝不靠用户填表），每条带来源与置信度
export const buyerProfiles = mysqlTable(
  "buyer_profiles",
  {
    userId: bigint("user_id", { mode: "number", unsigned: true }).primaryKey(),
    categories: json("categories").$type<Array<{ v: string; n: number }>>(), // 品类词按提及频次 top5
    destinations: json("destinations").$type<Array<{ v: string; n: number }>>(), // 目的国 top3
    quantities: json("quantities").$type<number[]>(), // 最近数量样本（最多 10 个）
    sampleSize: int("sample_size").notNull().default(0), // 参与推断的消息条数（置信度依据）
    inferredAt: timestamp("inferred_at").notNull().defaultNow(), // 推断时间（画像有时效）
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

// ============ 质检双检（2026-11-09 罗总拍板，PRD v1.1）============
// 一检=工厂完工后出货检（工厂按清单自拍证据→运营人工判定）；二检=入仓质检（实测重量/体积出第二段账单）
// 判定四值见 contracts/inspection.ts；报告编号 SB-QC-XXXXX 由 inspReportNo() 生成

export const inspectionReports = mysqlTable(
  "inspection_reports",
  {
    id: serial("id").primaryKey(),
    reportNo: varchar("report_no", { length: 24 }).notNull(), // SB-QC-00001（展示编号，生成见 contracts/inspection.ts）
    orderId: bigint("order_id", { mode: "number", unsigned: true }).notNull(),
    phase: int("phase").notNull(), // 1=出厂质检（一检） 2=入仓质检（二检）
    template: varchar("template", { length: 32 }).notNull().default("generic"), // 清单模板 id（baluster_ss / generic）
    status: mysqlEnum("status", ["uploading", "pending_review", "passed", "rework", "rejected", "signed"]).notNull().default("uploading"),
    uploadToken: varchar("upload_token", { length: 64 }).notNull(), // 工厂 H5 上传页令牌（一次性、可过期）
    tokenExpiresAt: timestamp("token_expires_at"), // 令牌过期时间（空=不过期，P0 默认 7 天）
    verdict: mysqlEnum("verdict", ["pass", "conditional", "rework", "reject"]), // 运营人工判定（AI 只预检，永不下判定）
    inspectorNote: text("inspector_note"), // 质检员批注（对买家可见，英文优先）
    inspectorId: bigint("inspector_id", { mode: "number", unsigned: true }), // 判定人（ops 账号 user id）
    factorySignPath: varchar("factory_sign_path", { length: 512 }), // 工厂盖章回传件路径（触发 60% 货款节点）
    pdfPath: varchar("pdf_path", { length: 512 }), // 生成的英文 PDF 报告路径
    measuredWeightKg: decimal("measured_weight_kg", { precision: 10, scale: 3 }), // 二检实测重量（出账依据）
    measuredVolumeCbm: decimal("measured_volume_cbm", { precision: 10, scale: 4 }), // 二检实测体积（出账依据）
    reviewedAt: timestamp("reviewed_at"), // 判定时间
    signedAt: timestamp("signed_at"), // 工厂签章回传时间
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_insp_no").on(t.reportNo),
    uniqueIndex("uq_insp_token").on(t.uploadToken),
    index("ix_insp_order").on(t.orderId, t.phase),
  ]
);

export const inspectionEvidences = mysqlTable(
  "inspection_evidences",
  {
    id: serial("id").primaryKey(),
    reportId: bigint("report_id", { mode: "number", unsigned: true }).notNull(),
    itemCode: varchar("item_code", { length: 32 }).notNull(), // 清单项 code（batch_tag/appearance/spectrometer/...）
    mediaType: mysqlEnum("media_type", ["photo", "video", "file"]).notNull(), // file=PDF 等文档（材质单/盖章回传）
    filePath: varchar("file_path", { length: 512 }).notNull(), // 相对 uploads/ 的存储路径（按 id 鉴权访问，不直接暴露）
    fileSize: int("file_size").notNull(), // 字节
    uploadedBy: mysqlEnum("uploaded_by", ["factory", "warehouse", "ops"]).notNull(), // 一检=factory 二检=warehouse 补传=ops
    note: varchar("note", { length: 255 }), // 上传备注（可选）
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_ievd_report").on(t.reportId, t.itemCode)]
);

// ============ 对方系统 products 全量资产（2026-11-10 灌库 396,445 条，db/import-legacy-products.ts）============
// 纪律：原样入库不清洗；tier_legacy 与对方口径物理隔离；factory_score 是工厂快照分非商品分
export const legacyProducts = mysqlTable(
  "legacy_products",
  {
    productId: varchar("product_id", { length: 32 }).primaryKey(), // 1688 offer id
    title: varchar("title", { length: 512 }).notNull(),
    specJson: text("spec_json"),
    specText: text("spec_text"),
    fineCategory: varchar("fine_category", { length: 128 }),
    memberId: varchar("member_id", { length: 64 }), // → join factories.member_id
    factoryName: varchar("factory_name", { length: 255 }),
    factoryScore: decimal("factory_score", { precision: 4, scale: 1 }),
    tierLegacy: varchar("tier_legacy", { length: 16 }),
    priceCny: decimal("price_cny", { precision: 12, scale: 2 }),
    priceSuspect: int("price_suspect").notNull().default(0),
    moqText: varchar("moq_text", { length: 64 }),
    moqMin: int("moq_min"),
    image: text("image"),
    importedAt: timestamp("imported_at").notNull().defaultNow(),
  },
  (t) => [index("ix_lp_member").on(t.memberId), index("ix_lp_cat").on(t.fineCategory), index("ix_lp_score").on(t.factoryScore)]
);

// ============ M5 经营埋点（2026-11-11）============
// 站内自建埋点（不接 GA）：只收 page_view，口径见 contracts/metrics.ts
export const analyticsEvents = mysqlTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    ts: datetime("ts", { fsp: 3, mode: "date" }).notNull().default(dsql`CURRENT_TIMESTAMP(3)`),
    event: varchar("event", { length: 32 }).notNull(),
    anonId: varchar("anon_id", { length: 64 }), // 匿名设备 ID（注册前追踪）
    userId: int("user_id"), // 注册后补挂（库内实际为 INT，够用；后续量大再升 bigint）
    path: varchar("path", { length: 255 }),
    referrer: varchar("referrer", { length: 512 }),
    utmSource: varchar("utm_source", { length: 64 }),
    utmMedium: varchar("utm_medium", { length: 64 }),
    utmCampaign: varchar("utm_campaign", { length: 128 }),
    lang: varchar("lang", { length: 8 }),
    ua: varchar("ua", { length: 255 }),
  },
  (t) => [
    index("idx_ev_ts").on(t.event, t.ts),
    index("idx_anon").on(t.anonId),
    index("idx_src_ts").on(t.utmSource, t.ts),
    index("idx_ts").on(t.ts),
  ]
);
