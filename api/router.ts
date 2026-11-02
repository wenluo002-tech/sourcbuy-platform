import { createRouter, publicQuery } from "./middleware";
import { z } from "zod";
import {
  findFactories,
  findFactoryById,
  factoryStats,
  calcLandedPrice,
  matchFactories,
} from "./queries/factories";
import { sourcingChat } from "./queries/aiSourcing";
import { offerWithFactory } from "./queries/products";
import { classifyAiError, AiUnavailable } from "./lib/ai-client";

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
        })
      )
      .query(({ input }) => findFactories(input)),

    detail: publicQuery
      .input(z.object({ id: z.number() }))
      .query(({ input }) => findFactoryById(input.id)),

    stats: publicQuery.query(() => factoryStats()),

    match: publicQuery
      .input(
        z.object({
          keyword: z.string().optional(),
          location: z.string().optional(),
          minScore: z.number().optional(),
          limit: z.number().optional(),
        })
      )
      .query(({ input }) => matchFactories(input)),
  }),

  pricing: createRouter({
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
          channel: z.enum(["express", "line", "sea"]),
          destinationCode: z.string().max(2).optional(),
          exchangeRate: z.number().positive().optional(),
        })
      )
      .query(({ input }) => calcLandedPrice(input)),
  }),
  products: createRouter({
    // 粘贴 1688 链接/货号 → 真实商品详情 + 背后的严选工厂（若在我们的库中）
    detail: publicQuery
      .input(z.object({ offerId: z.string().min(6).max(20) }))
      .query(async ({ input }) => {
        const { offer, factory } = await offerWithFactory(input.offerId);
        if (!offer) throw new Error("未能获取该商品，请确认货号或链接有效");
        return { offer, factory };
      }),
  }),

  ai: createRouter({chat: publicQuery
      .input(
        z.object({
          message: z.string().min(1).max(2000),
          history: z
            .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
            .max(20),
        })
      )
      .mutation(async ({ input }) => {
        try {
          return await sourcingChat(input.message, input.history);
        } catch (err) {
          const classified = classifyAiError(err);
          if (classified instanceof AiUnavailable) {
            return {
              reply: "AI 采购助手暂时不可用（服务额度已用尽），请稍后再试，或先用上方搜索框按品类查找工厂。",
              understood: false,
              intent: { product: null, quantity: null },
              factories: [],
              degraded: true,
            };
          }
          throw err;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
