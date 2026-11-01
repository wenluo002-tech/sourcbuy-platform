import { Link, Outlet, useLocation } from "react-router";

const NAV = [
  { to: "/", label: "首页" },
  { to: "/factories", label: "严选工厂库" },
  { to: "/calculator", label: "到手价试算" },
];

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight">SourcBuy</span>
            <span className="hidden text-xs text-stone-500 sm:inline">AI 采购代理</span>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`rounded-md px-2 py-2 text-xs transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-3 sm:text-sm ${
                  pathname === n.to
                    ? "font-semibold text-emerald-800"
                    : "text-stone-600"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-500">
        SourcBuy · 代表买家立场的 AI 采购代理 — 不收工厂返点 · 不加隐藏差价 · 报价原样可见
      </footer>
    </div>
  );
}
