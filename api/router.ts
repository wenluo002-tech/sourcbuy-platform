import { createRouter, publicQuery } from "./middleware";
import { z } from "zod";
import {
  findFactories,
  findFactoryById,
  factoryStats,
  calcLandedPrice,
  matchFactories,
} from "./queries/factories";

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
          exchangeRate: z.number().positive().optional(),
        })
      )
      .query(({ input }) => calcLandedPrice(input)),
  }),
});

export type AppRouter = typeof appRouter;
