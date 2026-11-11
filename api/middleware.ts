import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { log } from "./lib/logger";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // G9: a procedure that throws never reaches app.onError — the tRPC fetch
  // adapter catches it and returns its own 500 JSON, so the Hono error handler
  // is bypassed entirely. That left the most common real failure (a mutation
  // 500ing) with NO structured record in app.log on the server side; it only
  // appeared if the caller happened to log it in its own catch. This hook is the
  // missing server-side safety net. INTERNAL_SERVER_ERROR only: a thrown
  // TRPCError like UNAUTHORIZED is a deliberate business answer, not a crash,
  // and logging those would drown the file.
  errorFormatter({ shape, error }) {
    if (error.code === "INTERNAL_SERVER_ERROR") {
      log.error("trpc procedure failed", {
        path: shape.data?.path,
        code: error.code,
        error: error.message,
        stack: error.stack,
      });
    }
    return shape;
  },
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

// M3a：需要登录的 procedure（买家侧账号体系）
export const authedQuery = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "login required" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// 质检双检 P0 / M5 管理后台共用：运营身份判定——邮箱在 OPS_ADMIN_EMAILS 白名单内（逗号分隔，大小写不敏感）
export function isOpsEmail(email?: string | null): boolean {
  const allow = (process.env.OPS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const e = (email ?? "").toLowerCase();
  return !!allow.length && !!e && allow.includes(e);
}

// 运营闸——登录 + 白名单；白名单为空时拒绝一切 ops 调用（宁可误拒不可误放）；买家侧接口不受影响
export const opsQuery = authedQuery.use(({ ctx, next }) => {
  if (!isOpsEmail(ctx.user?.email)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "ops only" });
  }
  return next({ ctx });
});
