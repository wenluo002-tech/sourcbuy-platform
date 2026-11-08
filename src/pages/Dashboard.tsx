// M4a 我的工作台：进行中订单 + 待办 + 统计 + 快捷入口；未登录引导（不做假数据）
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";

export default function Dashboard() {
  const { me, loading } = useAuth();
  const { t } = useT();
  const sumQ = trpc.dashboard.summary.useQuery(undefined, { enabled: !!me });

  if (loading) return null;

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t("dash.loginTitle")}</h1>
        <p className="mt-3 text-sm text-[var(--sb-ink-60)]">{t("dash.loginBody")}</p>
        <Link
          to="/login?next=/dashboard"
          className="mt-6 inline-block rounded-xl bg-[var(--sb-brand)] px-6 py-2.5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)]"
        >
          {t("dash.loginCta")}
        </Link>
      </div>
    );
  }

  const s = sumQ.data?.stats;
  const stats = [
    { label: t("dash.statsActive"), value: s?.activeCount ?? "–" },
    { label: t("dash.statsOrders"), value: s?.totalOrders ?? "–" },
    { label: t("dash.statsInquiries"), value: s?.inquiries ?? "–" },
    { label: t("dash.statsUnread"), value: s?.unread ?? "–" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sb-brand)]">Dashboard</p>
          <h1 className="mt-1 font-[var(--sb-font-display)] text-2xl font-semibold">
            {t("dash.welcome")}，{me.displayName || me.email.split("@")[0]}
          </h1>
          <p className="mt-1 text-xs text-[var(--sb-ink-40)]">{t("dash.sub")}</p>
        </div>
        <Link
          to="/buyer"
          className="rounded-xl bg-[var(--sb-brand)] px-5 py-2.5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)]"
        >
          {t("dash.newInquiryCta")}
        </Link>
      </div>

      {/* 统计卡 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((it) => (
          <div key={it.label} className="rounded-2xl border border-[var(--sb-line)] bg-white p-4">
            <p className="text-2xl font-semibold tabular-nums">{it.value}</p>
            <p className="mt-1 text-xs text-[var(--sb-ink-60)]">{it.label}</p>
          </div>
        ))}
      </div>

      {/* 待办 */}
      {sumQ.data && sumQ.data.todos.length > 0 && (
        <div className="mt-6 rounded-2xl border border-[#b45309]/30 bg-[#fffbeb] p-4">
          <p className="text-sm font-semibold text-[#92400e]">{t("dash.todos")}</p>
          <div className="mt-2 space-y-2">
            {sumQ.data.todos.map((o) => (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-2.5 text-sm transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{o.productTitle || o.orderNo}</span>
                <span className="shrink-0 rounded-full bg-[#b45309]/10 px-2.5 py-1 text-xs font-medium text-[#92400e]">
                  {o.status === "quoted" ? t("dash.todoQuote") : t("dash.todoPay")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 进行中订单 */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("dash.activeOrders")}</h2>
          <Link to="/orders" className="text-xs text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline">
            {t("dash.viewAll")}
          </Link>
        </div>
        <div className="mt-3 space-y-3">
          {sumQ.isLoading ? (
            <p className="py-8 text-center text-sm text-[var(--sb-ink-40)]">…</p>
          ) : !sumQ.data?.activeOrders.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--sb-line)] py-10 text-center">
              <p className="text-sm text-[var(--sb-ink-40)]">{t("dash.emptyOrders")}</p>
              <Link to="/buyer" className="mt-3 inline-block text-xs font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline">
                {t("dash.newInquiryCta")}
              </Link>
            </div>
          ) : (
            sumQ.data.activeOrders.map((o) => (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className="flex items-center gap-4 rounded-2xl border border-[var(--sb-line)] bg-white p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]"
              >
                {o.productImage && (
                  <img src={o.productImage} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-lg border border-[var(--sb-line)] object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{o.productTitle || o.orderNo}</p>
                  <p className="mt-0.5 text-xs text-[var(--sb-ink-40)]">
                    {o.orderNo}
                    {o.quantity ? ` · ${o.quantity}` : ""}
                    {o.destination ? ` · ${o.destination}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--sb-brand-soft)] px-2.5 py-1 text-xs font-medium text-[var(--sb-brand)]">
                  {t(`orders.status.${o.status}`)}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link to="/inquiries" className="rounded-2xl border border-[var(--sb-line)] bg-white p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]">
          <p className="text-sm font-semibold">{t("dash.inquiries")}</p>
          <p className="mt-1 text-xs text-[var(--sb-ink-60)]">{t("dash.inquiriesDesc")}</p>
        </Link>
        <Link to="/addresses" className="rounded-2xl border border-[var(--sb-line)] bg-white p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]">
          <p className="text-sm font-semibold">{t("dash.addresses")}</p>
          <p className="mt-1 text-xs text-[var(--sb-ink-60)]">{t("dash.addressesDesc")}</p>
        </Link>
        <Link to="/notifications" className="rounded-2xl border border-[var(--sb-line)] bg-white p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {t("dash.messages")}
            {!!s?.unread && <span className="rounded-full bg-[var(--sb-brand)] px-1.5 py-0.5 text-[10px] font-bold text-white">{s.unread}</span>}
          </p>
          <p className="mt-1 text-xs text-[var(--sb-ink-60)]">{t("dash.messagesDesc")}</p>
        </Link>
      </div>
    </div>
  );
}
