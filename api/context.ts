import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { getSessionUser, readSessionCookie, type SessionUser } from "./lib/auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: SessionUser | null;
  sessionToken: string | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const sessionToken = readSessionCookie(opts.req);
  const user = await getSessionUser(sessionToken).catch(() => null); // 会话查询挂了不挡公共接口
  return { req: opts.req, resHeaders: opts.resHeaders, user, sessionToken };
}
