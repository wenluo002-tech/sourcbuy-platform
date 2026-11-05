// M3a 前端认证上下文（2026-11-05）：me 查询 + 登录/注册/退出 mutation + 匿名设备 ID
import { createContext, useContext, type ReactNode } from "react";
import { trpc } from "./providers/trpc";

export type Me = { id: number; email: string; displayName: string | null; locale: string | null } | null;

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
      utils.auth.me.invalidate();
      utils.threads.list.invalidate();
    },
  });
  return (
    <Ctx.Provider
      value={{
        me: meQ.data ?? null,
        loading: meQ.isLoading,
        logout: () => logoutM.mutate(),
        refresh: () => utils.auth.me.invalidate(),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
