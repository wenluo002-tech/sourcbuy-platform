// M3a 前端认证上下文（2026-11-05）：me 查询 + 登录/注册/退出 mutation + 匿名设备 ID
// 2026-11-09 修复：预览面板是跨站 iframe，httpOnly cookie 被浏览器第三方策略拦截，
// 登录 200 却永远匿名。改为 token 双通道——登录/注册响应体回 token 存 localStorage，
// tRPC 客户端每个请求带 Authorization: Bearer（见 providers/trpc.tsx）；cookie 通道保留。
import { createContext, useContext, type ReactNode } from "react";
import { trpc } from "./providers/trpc";

export type Me = { id: number; email: string; displayName: string | null; locale: string | null; isAdmin?: boolean } | null;

const TOKEN_KEY = "sb-token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}
/** 无法带 Authorization 头的直接引用（<img>/<a> 打开 PDF）拼 ?at= 凭证 */
export function withAuthToken(url: string): string {
  const t = getToken();
  if (!t) return url;
  return url + (url.includes("?") ? "&" : "?") + "at=" + encodeURIComponent(t);
}

export function getAnonId(): string | undefined {
  try {
    let v = localStorage.getItem("sb-anon");
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem("sb-anon", v);
    }
    return v;
  } catch {
    return undefined;
  }
}

type AuthCtx = {
  me: Me;
  loading: boolean;
  logout: () => void;
  refresh: () => void;
};

const Ctx = createContext<AuthCtx>({ me: null, loading: true, logout: () => {}, refresh: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();
  const meQ = trpc.auth.me.useQuery(undefined, { staleTime: 60_000, retry: false });
  const logoutM = trpc.auth.logout.useMutation({
    onSettled: () => {
      setToken(null);
      utils.auth.me.invalidate();
      utils.threads.list.invalidate();
    },
  });
  return (
    <Ctx.Provider
      value={{
        me: meQ.data ?? null,
        loading: meQ.isLoading,
        logout: () => { setToken(null); logoutM.mutate(); },
        refresh: () => utils.auth.me.invalidate(),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
