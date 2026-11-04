import { Link, Outlet, useLocation } from "react-router";
import logoHorizontal from "@/assets/logo-horizontal.png";
import logoMark from "@/assets/logo-mark.png";

const NAV = [
  { to: "/buyer", zh: "开始采购", en: "SOURCING" },
  { to: "/radar", zh: "爆款雷达", en: "RADAR" },
  { to: "/factories", zh: "严选工厂库", en: "FACTORIES" },
  { to: "/calculator", zh: "到手价试算", en: "LANDED COST" },
];

export default function Layout() {
  const { pathname } = useLocation();
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
          <nav className="flex items-center gap-0.5 sm:gap-1.5">
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
                    {n.en}
                  </span>
                  <span
                    className={`mt-1 block text-xs sm:text-sm ${
                      active
                        ? "font-semibold text-[var(--sb-brand)]"
                        : "text-[var(--sb-ink-60)] group-hover:text-[var(--sb-ink)]"
                    }`}
                  >
                    {n.zh}
                  </span>
                  <span
                    className={`absolute inset-x-2 -bottom-[13px] h-[2px] bg-[var(--sb-brand)] transition-opacity duration-150 sm:inset-x-3 ${
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                    }`}
                  />
                </Link>
              );
            })}
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
            只代表买家立场 — 不收工厂返点 · 不加隐藏差价 · 佣金费率公开 · 损失先行赔付
          </p>
        </div>
      </footer>
    </div>
  );
}
