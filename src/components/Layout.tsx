import { Link, Outlet, useLocation } from "react-router";

const NAV = [
  { to: "/buyer", zh: "开始采购", en: "SOURCING" },
  { to: "/factories", zh: "严选工厂库", en: "FACTORIES" },
  { to: "/calculator", zh: "到手价试算", en: "LANDED COST" },
];

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh bg-[var(--sb-paper)] text-[var(--sb-ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--sb-line)] bg-[var(--sb-paper)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="group flex flex-col leading-none">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sb-teal)]">
              Buyer-side Agent
            </span>
            <span className="mt-1 text-lg font-bold tracking-tight">
              SourcBuy
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            {NAV.map((n) => {
              const active =
                n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`group whitespace-nowrap rounded-md px-2 py-2 leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sb-teal)] sm:px-3.5 ${
                    active ? "bg-[var(--sb-teal-soft)]" : "hover:bg-[var(--sb-teal-soft)]"
                  }`}
                >
                  <span className="hidden text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--sb-ink-40)] group-hover:text-[var(--sb-teal)] sm:block">
                    {n.en}
                  </span>
                  <span
                    className={`mt-1 block text-xs sm:text-sm ${
                      active
                        ? "font-semibold text-[var(--sb-teal)]"
                        : "text-[var(--sb-ink-60)] group-hover:text-[var(--sb-ink)]"
                    }`}
                  >
                    {n.zh}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--sb-line)] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sb-ink-40)]">
            SourcBuy · Buyer-side Only
          </span>
          <p className="text-xs text-[var(--sb-ink-60)]">
            只代表买家立场 — 不收工厂返点 · 不加隐藏差价 · 佣金费率公开 · 损失先行赔付
          </p>
        </div>
      </footer>
    </div>
  );
}
