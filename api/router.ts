import { createRouter, publicQuery, authedQuery, opsQuery, isOpsEmail } from "./middleware";
import { bindUserAttr } from "./queries/analytics";
import { adminOverview, adminChannels, adminBuyers, adminBuyerDetail, adminOrders, adminHealth } from "./queries/admin";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  findFactories,
  findFactoryById,
  factoryStats,
  factoryCategoryStats,
  calcLandedPrice,
  listCommissionRules,
  matchFactories,
  getFactoryPassport,
} from "./queries/factories";
import { sourcingChat } from "./queries/aiSourcing";
import { tempCheckFactory } from "./queries/tempCheck";
import { logRecommendation, updateBuyerProfile } from "./queries/context";
import { listRadar } from "./queries/radar";
import { offerWithFactory } from "./queries/products";
import { getOfferDetail, searchOffers } from "./sourcing/offerService";
import { classifyAiError, AiUnavailable } from "./lib/ai-client";
import { channelsForCountry, CARGO_TYPES, CA_SEA_REGIONS, SUSPENDED_CHANNELS } from "../contracts/freightRates";
import { registerUser, loginUser, AuthError, claimAnonThreads, ensureThread, appendMessage, listThreads, getThreadMessages } from "./queries/auth";
import { createInquiry, listMyOrders, getOrderDetail, transitionOrder } from "./queries/orders";
import * as qc from "./queries/inspection";
import {
  listAddresses, createAddress, updateAddress, removeAddress, setDefaultAddress,
  listNotifications, unreadCount, markRead, markAllRead, dashboardSummary,
} from "./queries/account";
import { destroySession, sessionCookieHeader, clearSessionCookieHeader } from "./lib/auth";
import { isUnlockedBuyer, maskFactory, maskOffer } from "./lib/mask";
import { proxyImageUrl } from "./lib/imgProxy";
import { log } from "./lib/logger";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  factories: createRouter({
    list: publicQuery
      .input(
        z.object({
          tier: z.string().optional(),
          location: z.string().optional(),
          cert: z.string().optional(),
          isSuper: z.boolean().optional(),
          minScore: z.number().optional(),
          minYears: z.number().optional(),
          keyword: z.string().optional(),
          page: z.number().optional(),
          pageSize: z.number().optional(),
          locale: z.string().max(8).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const { locale, ...q } = input;
        const res = await findFactories({ ...q, unlocked: await isUnlockedBuyer(ctx.user?.id) });
        // 开放集合中文字段走输出层翻译（缓存同步替换+后台补缺，绝不阻塞）；medal 是 13 枚举，前端映射
        const { translateFields } = await import("./lib/translate");
        await translateFields(res.rows as any[], ["location"], locale);
        return res;
      }),

    detail: publicQuery
      .input(z.object({ id: z.number(), locale: z.string().max(8).optional() }))
      .query(async ({ input, ctx }) => {
        const f = await findFactoryById(input.id, await isUnlockedBuyer(ctx.user?.id));
        if (f) {
          const { translateFields } = await import("./lib/translate");
          await translateFields(
            [f as any],
            ["location", "province", "city", "district", "review", "cert", "certNote", "oemMode", "productionType", "serviceCapability", "category", "tags"],
            input.locale
          );
        }
        return f;
      }),
    // 供应商数字护照 v1：五段式结构化档案（身份/能力/证据/商业条件/状态），Agent 可读
    passport: publicQuery
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => getFactoryPassport(input.id, await isUnlockedBuyer(ctx.user?.id))),
    stats: publicQuery.query(() => factoryStats()),
    categoryStats: publicQuery
      .input(z.object({ locale: z.string().max(8).optional() }).optional())
      .query(async ({ input }) => {
        const res = await factoryCategoryStats();
        const { translateFields } = await import("./lib/translate");
        await translateFields(res.byCategory as any[], ["category"], input?.locale);
        return res;
      }),
    // 临时查厂：买家报名字实时核查库外工厂（结果只留档 temp_factory_checks，绝不写严选库）
    tempCheck: authedQuery
      .input(z.object({ name: z.string().min(4).max(60) }))
      .mutation(({ input, ctx }) => tempCheckFactory(input.name, ctx.user.id)),

    match: publicQuery
      .input(
        z.object({
          keyword: z.string().optional(),
          location: z.string().optional(),
          minScore: z.number().optional(),
          limit: z.number().optional(),
          locale: z.string().max(8).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const { locale, ...q } = input;
        const rows = await matchFactories({ ...q, unlocked: await isUnlockedBuyer(ctx.user?.id) });
        // location/reason/tags/evidence 全走输出层翻译（缓存同步+后台补缺，不阻塞）
        const { translateFields } = await import("./lib/translate");
        await translateFields(rows as any[], ["location", "reason", "tags", "evidence"], locale);
        return rows;
      }),
  }),

  pricing: createRouter({
    // 目的地 → 可用真实渠道 + 货物属性 + 加拿大交仓区域（前端动态表单数据源）
    channels: publicQuery
      .input(z.object({ destinationCode: z.string().max(2).optional() }))
      .query(({ input }) => ({
        channels: channelsForCountry(input.destinationCode ?? "").map((c) => ({
          id: c.id,
          name: c.name,
          mode: c.mode,
          ddp: c.ddp,
          transitNote: c.transitNote,
          minShipmentKg: c.minShipmentKg,
          needsZip: c.country.includes("US") || c.country.includes("AU"),
          needsCaRegion: c.id.startsWith("ca_sea_"),
        })),
        cargoTypes: CARGO_TYPES,
        caRegions: CA_SEA_REGIONS,
        suspended: SUSPENDED_CHANNELS,
        priceVersion: "2026-10-15 价卡",
      })),
    // 佣金费率表 v1.0（结果卡服务费拆解行用；公开费率是铁律卖点，全量下发）
    commissionTable: publicQuery.query(() => listCommissionRules()),
    landed: publicQuery
      .input(
        z.object({
          unitPriceCny: z.number().positive(),
          quantity: z.number().int().positive(),
          weightKg: z.number().positive(),
          dimCm: z
            .object({ l: z.number(), w: z.number(), h: z.number() })
            .optional(),
          riskTier: z.enum(["A", "B", "C"]),
          channel: z.string(), // 真实渠道 id（freightRates）或通用估算 express/line/sea
          destinationCode: z.string().max(2).optional(),
          zip: z.string().max(12).optional(),
          caRegion: z.string().max(8).optional(),
          cargoType: z.string().max(32).optional(),
          residential: z.boolean().optional(),
          exchangeRate: z.number().positive().optional(),
        })
      )
      .query(({ input }) => calcLandedPrice(input)),
  }),
  products: createRouter({
    // 粘贴 1688 链接/货号 → 真实商品详情 + 背后的严选工厂（若在我们的库中）
    detail: publicQuery
      .input(z.object({ offerId: z.string().min(6).max(20) }))
      .query(async ({ input, ctx }) => {
        const { offer, factory } = await offerWithFactory(input.offerId);
        if (!offer) throw new Error("未能获取该商品，请确认货号或链接有效");
        const unlocked = await isUnlockedBuyer(ctx.user?.id);
        if (offer.images) (offer as any).images = (offer.images as string[]).map((u) => proxyImageUrl(u)); // 图片走代理藏源头身份
        return { offer: maskOffer(offer, unlocked), factory: maskFactory(factory, unlocked) };
      }),
    // V2：缓存→万邦→点金→legacy 四级链路（同一商品 24h 内零成本）；locale≠zh 时数据层按需翻译（终身缓存，失败回落原文）
    detailV2: publicQuery
      .input(z.object({ offerId: z.string().min(6).max(20), locale: z.string().max(8).optional() }))
      .query(async ({ input, ctx }) => {
        const { offer, factory } = await getOfferDetail(input.offerId);
        if (!offer) throw new Error("未能获取该商品，请确认货号或链接有效");
        const unlocked = await isUnlockedBuyer(ctx.user?.id);
        const mOffer = maskOffer(offer, unlocked)!; // offer 已非空（上面 404 拦截），maskOffer 只可能因 null 输入返 null
        // 图片走代理（2026-11-15 权益锁图片旁路修复）：主图与规格图的原始 URL 不下发
        mOffer.images = (mOffer.images ?? []).map((u) => proxyImageUrl(u));
        if (mOffer.specImages) for (const k of Object.keys(mOffer.specImages)) mOffer.specImages[k] = proxyImageUrl(mOffer.specImages[k]);
        if (input.locale && input.locale !== "zh") {
          const { translateTexts } = await import("./lib/translate");
          const skuTexts = mOffer.skus.map((s) => s.specText).filter(Boolean);
          // 标题/发货说明同步翻（小批 5s 内）；SKU 规格少（≤8）一起同步，多则后台填缓存、下次访问生效——绝不让买家为几十个规格名等 20 秒
          const syncTexts = [mOffer.title, mOffer.dispatchNote ?? "", ...(skuTexts.length <= 8 ? skuTexts : [])].filter(Boolean);
          const map = await translateTexts(syncTexts, input.locale);
          if (map[mOffer.title]) mOffer.title = map[mOffer.title];
          if (mOffer.dispatchNote && map[mOffer.dispatchNote]) mOffer.dispatchNote = map[mOffer.dispatchNote];
          if (skuTexts.length <= 8) {
            for (const s of mOffer.skus) if (map[s.specText]) s.specText = map[s.specText];
          } else {
            // 多 SKU：先查缓存把已翻好的批次立刻换上（渐进变译文），缺失部分后台分批补——下次刷新更全
            const { lookupCached } = await import("./lib/translate");
            const cached = await lookupCached(skuTexts, input.locale);
            for (const s of mOffer.skus) if (cached[s.specText]) s.specText = cached[s.specText];
            translateTexts(skuTexts, input.locale).catch(() => {}); // fire-and-forget 填缓存
          }
        }
        const mFactory = maskFactory(factory, unlocked);
        if (mFactory && input.locale && input.locale !== "zh") {
          // 背书区工厂地名走输出层翻译（tier 是 5 枚举，前端 i18n 已映射）
          const { translateFields } = await import("./lib/translate");
          await translateFields([mFactory as any], ["location"], input.locale);
        }
        return { offer: mOffer, factory: mFactory };
      }),
    // 关键词搜品：搜索缓存 30 分钟防刷
    search: publicQuery
      .input(z.object({ q: z.string().min(1).max(80), page: z.number().int().min(1).max(20).default(1) }))
      .query(async ({ input }) => {
        // v90 补漏：搜索结果图同样走代理藏源头身份（v89 只覆盖了 detail 等六处）
        const r = await searchOffers(input.q, input.page);
        for (const it of r.items) if (it.image) it.image = proxyImageUrl(it.image);
        return r;
      }),
  }),

  radar: createRouter({
    list: publicQuery
      .input(z.object({ locale: z.string().max(8).optional() }).optional())
      .query(async ({ input }) => {
        const data = await listRadar();
        // 翻译纪律：绝不阻塞响应——lookupCached 同步替换已缓存译文，缺失 fire-and-forget 后台补；
        // 缓存由版本发布前的 i18n 巡检器（db/i18n-scan.ts）铺满，线上用户永远命中快路径
        const { translateFields } = await import("./lib/translate");
        await translateFields(data.items as any[], ["signalText", "note"], input?.locale);
        return data;
      }),
  }),

  ai: createRouter({chat: publicQuery
      .input(
        z.object({
          message: z.string().min(1).max(2000),
          history: z
            .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
            .max(20),
          radarId: z.number().int().positive().optional(), // 雷达卡 CTA 直达：钉死品类与信号上下文
          imageData: z.string().max(6_000_000).optional(), // 商品图（base64 data URL，前端已压到 1024px JPEG）
          locale: z.enum(["zh", "en", "es", "fr", "pt"]).optional(), // 界面语言：非中文走英文话术体系+语言指令（LLM 按买家语言回复）
          threadId: z.number().int().positive().optional(), // M3a：续写已有会话
          anonId: z.string().max(36).optional(), // M3a：匿名设备 ID，登录后归并
        })
      )
      .mutation(async ({ input, ctx }) => {
        let result: any;
        try {
          result = await sourcingChat(input.message, input.history, input.radarId, input.imageData, input.locale, await isUnlockedBuyer(ctx.user?.id), ctx.user?.id ?? null);
        } catch (err) {
          const classified = classifyAiError(err);
          if (classified instanceof AiUnavailable) {
            result = {
              reply: input.locale != null && input.locale !== "zh"
                ? "The AI sourcing assistant is temporarily unavailable (service quota exhausted). Please try again later, or use the search above to find factories by category."
                : "AI 采购助手暂时不可用（服务额度已用尽），请稍后再试，或先用上方搜索框按品类查找工厂。",
              understood: false,
              intent: { product: null, quantity: null },
              factories: [],
              degraded: true,
            };
          } else {
            throw err;
          }
        }
        // M3a 会话落库：落库失败绝不挡聊天（买家体验优先，日志留证）
        let threadId: number | null = null;
        try {
          threadId = await ensureThread({ threadId: input.threadId, anonId: input.anonId, userId: ctx.user?.id ?? null, locale: input.locale, firstMessage: input.message });
          await appendMessage(threadId, "user", input.message, input.imageData ? { hasImage: true } : null);
          await appendMessage(threadId, "assistant", result.reply, {
            intent: result.intent ?? null,
            factories: result.factories ?? [],
            products: result.products ?? [],
            product: result.product ?? null,
            linkContext: result.linkContext ?? null,
            followUp: result.followUp ?? null,
            manualQuote: (result as any).manualQuote ?? false,
          });
        } catch (e) {
          log.error("chat 落库失败（聊天本身已返回）", { error: e instanceof Error ? e.message : String(e) });
        }
        // 买侧上下文资产（2026-11-08）：推荐证据链落库 + 买家画像增量更新。
        // 全部 fire-and-forget：失败只记日志，绝不拖慢聊天响应。
        void logRecommendation({
          userId: ctx.user?.id ?? null,
          threadId,
          message: input.message,
          intent: result.intent ?? null,
          destination: null, // intent.destination 未透出，证据链以 message 原文为准
          factories: result.factories ?? [],
          productsCount: Array.isArray(result.products) ? result.products.length : 0,
          hadLink: !!result.linkContext,
          hadImage: !!input.imageData,
          factoryQa: !!result.factoryQa,
        });
        if (ctx.user?.id) void updateBuyerProfile(ctx.user.id);
        return { ...result, threadId };
      }),
  }),

  // ---- M3a 账号体系（邮箱+密码；会话 cookie httpOnly，库内只存 sha256）----
  auth: createRouter({
    me: publicQuery.query(({ ctx }) => (ctx.user ? { ...ctx.user, isAdmin: isOpsEmail(ctx.user.email) } : ctx.user)),
    register: publicQuery
      .input(z.object({
        email: z.string().max(191),
        password: z.string().min(8).max(72),
        displayName: z.string().max(64).optional(),
        locale: z.enum(["zh", "en", "es", "fr", "pt"]).optional(),
        anonId: z.string().max(36).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        let r: Awaited<ReturnType<typeof registerUser>>;
        try {
          r = await registerUser(input.email, input.password, input.displayName, input.locale);
        } catch (e) {
          if (e instanceof AuthError) throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          throw e;
        }
        const { user, token, expiresAt } = r;
        await claimAnonThreads(input.anonId, user.id);
        await bindUserAttr(user.id, input.anonId).catch(() => {}); // M5：绑首次接触归因（不挡注册主流程）
        ctx.resHeaders.append("Set-Cookie", sessionCookieHeader(token, expiresAt, ctx.req.url.startsWith("https:")));
        // token 同时回响应体：跨站 iframe 预览里 cookie 会被浏览器拦截，前端存 localStorage 走 Bearer
        return { user, token };
      }),
    login: publicQuery
      .input(z.object({ email: z.string().max(191), password: z.string().min(1).max(72), anonId: z.string().max(36).optional() }))
      .mutation(async ({ input, ctx }) => {
        let r: Awaited<ReturnType<typeof loginUser>>;
        try {
          r = await loginUser(input.email, input.password);
        } catch (e) {
          if (e instanceof AuthError) throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
          throw e;
        }
        const { user, token, expiresAt } = r;
        await claimAnonThreads(input.anonId, user.id);
        await bindUserAttr(user.id, input.anonId).catch(() => {}); // M5：老买家登录也补绑（attr 只填空不覆盖）
        ctx.resHeaders.append("Set-Cookie", sessionCookieHeader(token, expiresAt, ctx.req.url.startsWith("https:")));
        return { user, token };
      }),
    logout: publicQuery.mutation(async ({ ctx }) => {
      await destroySession(ctx.sessionToken);
      ctx.resHeaders.append("Set-Cookie", clearSessionCookieHeader());
      return { ok: true };
    }),
  }),

  // ---- M3a 会话记忆：列表要登录；详情允许本人或匿名归属者读 ----
  threads: createRouter({
    list: authedQuery.query(({ ctx }) => listThreads(ctx.user.id)),
    detail: publicQuery
      .input(z.object({ threadId: z.number().int().positive(), anonId: z.string().max(36).optional() }))
      .query(({ input, ctx }) => getThreadMessages(input.threadId, ctx.user?.id ?? null, input.anonId)),
  }),

  // ---- M3b 订单：询价即建档，全部挂在账号下；流转走状态机，非法流转一律拒绝 ----
  orders: createRouter({
    create: authedQuery
      .input(z.object({
        threadId: z.number().int().positive().optional(),
        offerId: z.string().max(32).optional(),
        productTitle: z.string().max(500).optional(),
        productImage: z.string().max(1024).optional(),
        quantity: z.number().int().positive().max(10_000_000).optional(),
        destination: z.string().max(120).optional(),
        demand: z.string().max(5000).optional(),
      }))
      .mutation(({ input, ctx }) => createInquiry({ ...input, userId: ctx.user.id })),
    list: authedQuery.query(({ ctx }) => listMyOrders(ctx.user.id)),
    detail: authedQuery
      .input(z.object({ orderId: z.number().int().positive() }))
      .query(({ input, ctx }) => getOrderDetail(input.orderId, ctx.user.id)),
    // 买家动作：确认报价（quoted→pending_payment）/ 确认收货（shipped→received）/ 取消（付款前）
    act: authedQuery
      .input(z.object({
        orderId: z.number().int().positive(),
        action: z.enum(["confirmQuote", "confirmReceive", "cancel"]),
        note: z.string().max(500).optional(),
        decisionTags: z.array(z.string().max(32)).max(6).optional(), // 选择理由埋点（决策上下文资产）
        decisionNote: z.string().max(255).optional(),
        anonId: z.string().max(36).optional(), // M5：成交时末次接触归因用
      }))
      .mutation(async ({ input, ctx }) => {
        const to = input.action === "confirmQuote" ? "pending_payment" : input.action === "confirmReceive" ? "received" : "cancelled";
        const r = await transitionOrder({
          orderId: input.orderId, to, actor: "buyer", note: input.note, userId: ctx.user.id, anonId: input.anonId,
          ...(input.action === "confirmQuote" ? { decisionTags: input.decisionTags, decisionNote: input.decisionNote } : {}),
        });
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
  }),

  // ---- M5 经营驾驶舱（ops 白名单闸；口径见 contracts/metrics.ts）----
  admin: createRouter({
    overview: opsQuery
      .input(z.object({ range: z.enum(["today", "7d", "30d"]).optional() }))
      .query(({ input }) => adminOverview(input.range)),
    channels: opsQuery
      .input(z.object({ range: z.enum(["today", "7d", "30d"]).optional() }))
      .query(({ input }) => adminChannels(input.range)),
    buyers: opsQuery
      .input(z.object({ q: z.string().max(64).optional() }))
      .query(({ input }) => adminBuyers(input.q)),
    buyerDetail: opsQuery
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => adminBuyerDetail(input.id)),
    orders: opsQuery
      .input(z.object({ status: z.string().max(32).optional() }))
      .query(({ input }) => adminOrders(input.status)),
    orderAct: opsQuery
      .input(z.object({ orderId: z.number().int().positive(), to: z.string().max(32), note: z.string().max(500).optional() }))
      .mutation(async ({ input }) => {
        const r = await transitionOrder({ orderId: input.orderId, to: input.to as any, actor: "ops", note: input.note });
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
    health: opsQuery.query(() => adminHealth()),
  }),

  // ---- M4a 买家后台：地址簿 / 消息中心 / 工作台汇总（全部 authed，userId 隔离）----
  addresses: createRouter({
    list: authedQuery.query(({ ctx }) => listAddresses(ctx.user.id)),
    create: authedQuery
      .input(z.object({
        label: z.string().max(64).optional(),
        contactName: z.string().min(1).max(128),
        phone: z.string().min(3).max(64),
        country: z.string().min(1).max(64),
        state: z.string().max(128).optional(),
        city: z.string().max(128).optional(),
        address1: z.string().min(1).max(255),
        address2: z.string().max(255).optional(),
        postcode: z.string().max(32).optional(),
      }))
      .mutation(({ input, ctx }) => createAddress(ctx.user.id, input)),
    update: authedQuery
      .input(z.object({
        id: z.number().int().positive(),
        label: z.string().max(64).optional(),
        contactName: z.string().min(1).max(128).optional(),
        phone: z.string().min(3).max(64).optional(),
        country: z.string().min(1).max(64).optional(),
        state: z.string().max(128).optional(),
        city: z.string().max(128).optional(),
        address1: z.string().min(1).max(255).optional(),
        address2: z.string().max(255).optional(),
        postcode: z.string().max(32).optional(),
      }))
      .mutation(({ input, ctx }) => {
        const { id, ...fields } = input;
        return updateAddress(ctx.user.id, id, fields);
      }),
    remove: authedQuery
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input, ctx }) => removeAddress(ctx.user.id, input.id)),
    setDefault: authedQuery
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input, ctx }) => setDefaultAddress(ctx.user.id, input.id)),
  }),

  notifications: createRouter({
    list: authedQuery.query(({ ctx }) => listNotifications(ctx.user.id)),
    unreadCount: authedQuery.query(({ ctx }) => unreadCount(ctx.user.id)),
    markRead: authedQuery
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input, ctx }) => markRead(ctx.user.id, input.id)),
    markAllRead: authedQuery.mutation(({ ctx }) => markAllRead(ctx.user.id)),
  }),

  dashboard: createRouter({
    summary: authedQuery.query(({ ctx }) => dashboardSummary(ctx.user.id)),
  }),

  // ---- 质检双检（2026-11-09 PRD v1.1）：买家看自己订单的报告；运营走 opsQuery 白名单闸 ----
  // 工厂/仓库 H5 上传走 REST /api/qc/upload（multipart 视频装不进 tRPC 50MB bodyLimit，见 boot.ts）
  inspection: createRouter({
    // 买家：自己订单的质检报告列表（归属校验在查询层，越权返回 null）
    listMine: authedQuery
      .input(z.object({ orderId: z.number().int().positive() }))
      .query(({ input, ctx }) => qc.listForBuyer(input.orderId, ctx.user.id)),
    // 工厂/仓库 H5：凭 token 读上传页数据 + 提交待判定（token 即凭证，永不透给买家侧）
    byToken: publicQuery
      .input(z.object({ token: z.string().min(16).max(64) }))
      .query(({ input }) => qc.getByToken(input.token)),
    submitByToken: publicQuery
      .input(z.object({ token: z.string().min(16).max(64) }))
      .mutation(async ({ input }) => {
        const r = await qc.submitByToken(input.token);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
    // 运营：开报告（一检挂 goods_ready / 二检挂 in_warehouse），返回上传 token（发给工厂的 H5 链接）
    create: opsQuery
      .input(z.object({
        orderId: z.number().int().positive(),
        phase: z.union([z.literal(1), z.literal(2)]),
        template: z.string().max(32).optional(),
      }))
      .mutation(async ({ input }) => {
        const r = await qc.createReport(input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
    // 运营：质检工作台——待判定/全部报告列表
    list: opsQuery
      .input(z.object({ status: z.string().max(20).optional() }))
      .query(({ input }) => qc.listForOps(input)),
    // 运营：可操作订单列表（报完工/已到仓/质检中的订单 + 各自报告状态）
    actionable: opsQuery.query(() => qc.listActionableOrders()),
    // 运营：报告详情（含证据清单）
    detail: opsQuery
      .input(z.object({ reportId: z.number().int().positive() }))
      .query(({ input }) => qc.getOpsDetail(input.reportId)),
    // 运营：人工判定（AI 只预检，判定权永远在人）
    review: opsQuery
      .input(z.object({
        reportId: z.number().int().positive(),
        verdict: z.enum(["pass", "conditional", "rework", "reject"]),
        note: z.string().max(2000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const r = await qc.reviewReport({ ...input, inspectorId: ctx.user.id });
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
    // 运营：返工后重新开放上传（令牌换新）
    reopen: opsQuery
      .input(z.object({ reportId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const r = await qc.reopenUpload(input.reportId);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
    // 运营：确认工厂盖章回传（触发 60% 货款节点）
    markSigned: opsQuery
      .input(z.object({ reportId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const r = await qc.markSigned(input.reportId);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
    // 运营/仓库：二检实测重量体积（第二段账单出账依据）
    measure: opsQuery
      .input(z.object({
        reportId: z.number().int().positive(),
        weightKg: z.number().positive(),
        volumeCbm: z.number().positive(),
      }))
      .mutation(async ({ input }) => {
        const r = await qc.recordMeasurements(input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
  }),
});

export type AppRouter = typeof appRouter;
