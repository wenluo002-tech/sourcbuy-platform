import { Link, Outlet, useLocation } from "react-router";
import logoHorizontal from "@/assets/logo-horizontal.png";
import logoMark from "@/assets/logo-mark.png";
import { useT, LANGS, LANG_LABEL, type Lang } from "@/i18n";
import { useAuth } from "@/auth";
import { trpc } from "@/providers/trpc";

const NAV = [
  { to: "/buyer", key: "nav.sourcing", tag: "SOURCING" },
  { to: "/radar", key: "nav.radar", tag: "RADAR" },
  { to: "/factories", key: "nav.factories", tag: "FACTORIES" },
  { to: "/calculator", key: "nav.calculator", tag: "LANDED COST" },
];

export default function Layout() {
  const { pathname } = useLocation();
  const { lang, setLang, t } = useT();
  const { me, logout } = useAuth();
  // M4a：未读消息角标（登录才查，60s 内不重复请求）
  const unreadQ = trpc.notifications.unreadCount.useQuery(undefined, { enabled: !!me, staleTime: 60_000, refetchInterval: 120_000 });
  const unread = unreadQ.data ?? 0;
  return (
    <div className="min-h-dvh bg-[var(--sb-paper)] text-[var(--sb-ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--sb-rule)] bg-[var(--sb-paper)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="group flex shrink-0 items-center gap-2.5">
            <img
              src={logoMark}
              alt="SourcBuy"
              className="h-8 w-auto shrink-0 sm:hidden"
            />
            <img
              src={logoHorizontal}
              alt="SourcBuy"
              className="hidden h-8 w-auto shrink-0 sm:block sm:h-9"
            />
            <span className="hidden border-l border-[var(--sb-rule)] pl-2.5 text-[10px] font-semibold uppercase leading-tight tracking-[0.22em] text-[var(--sb-brand)] md:block">
              Buyer-side
              <br />
              Agent
            </span>
          </Link>
          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1.5">
            {NAV.map((n) => {
              const active =
                n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className="group relative whitespace-nowrap px-2 py-2 leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sb-brand)] sm:px-3"
                >
                  <span className="hidden text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--sb-ink-40)] group-hover:text-[var(--sb-brand)] sm:block">
                    {n.tag}
                  </span>
                  <span
                    className={`mt-1 block text-xs sm:text-sm ${
                      active
                        ? "font-semibold text-[var(--sb-brand)]"
                        : "text-[var(--sb-ink-60)] group-hover:text-[var(--sb-ink)]"
                    }`}
                  >
                    {t(n.key)}
                  </span>
                  <span
                    className={`absolute inset-x-2 -bottom-[13px] h-[2px] bg-[var(--sb-brand)] transition-opacity duration-150 sm:inset-x-3 ${
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                    }`}
                  />
                </Link>
              );
            })}
            {me ? (
              <span className="ml-1 flex shrink-0 items-center gap-1.5 sm:ml-2">
                <Link
                  to="/dashboard"
                  className="relative border border-[var(--sb-rule)] px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
                >
                  {t("dash.navEntry")}
                  {unread > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sb-brand)] px-1 text-[9px] font-bold text-white">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
                <span className="hidden max-w-28 truncate text-xs font-medium text-[var(--sb-ink-60)] md:block">
                  {me.displayName || me.email.split("@")[0]}
                </span>
                <button
                  onClick={() => logout()}
                  className="border border-[var(--sb-rule)] px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
                >
                  {t("nav.signOut")}
                </button>
              </span>
            ) : (
              <Link
                to={"/login?next=" + encodeURIComponent(pathname)}
                className="ml-1 shrink-0 border border-[var(--sb-rule)] px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)] sm:ml-2"
              >
                {t("nav.signIn")}
              </Link>
            )}
            {/* 六语言切换：原生 select（移动端系统级滚轮选择器，可靠性高于自绘下拉）。data-i18n-skip：语言名按国际惯例保留原名（"中文"等），巡检器跳过 */}
            <select
              data-i18n-skip
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="ml-1 shrink-0 cursor-pointer appearance-none border border-[var(--sb-rule)] bg-transparent px-2 py-1 text-center text-[10px] font-semibold tracking-[0.12em] text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)] sm:ml-2"
              aria-label="Switch language"
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {LANG_LABEL[l]}
                </option>
              ))}
            </select>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--sb-rule)] py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2.5 px-4 text-center">
          <img src={logoMark} alt="" className="h-7 w-auto opacity-80" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sb-ink-40)]">
            Buyer-side Only
          </span>
          <p className="text-xs text-[var(--sb-ink-60)]">
            {t("footer.tagline")}
          </p>
        </div>
      </footer>
    </div>
  );
}
