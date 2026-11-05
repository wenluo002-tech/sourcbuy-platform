// M3b 我的订单列表：登录后可见；未登录给引导（不做假数据）
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";

export default function Orders() {
  const { me, loading } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const listQ = trpc.orders.list.useQuery(undefined, { enabled: !!me });
  const createMut = trpc.orders.create.useMutation({
    onSuccess: (r) => nav(`/orders/${r.orderId}`),
  });
  const [showForm, setShowForm] = useState(false);
  const [demand, setDemand] = useState("");
  const [qty, setQty] = useState("");
  const [dest, setDest] = useState("");

  if (loading) return null;

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t("orders.loginTitle")}</h1>
        <p className="mt-3 text-sm text-[var(--sb-ink-60)]">{t("orders.loginBody")}</p>
        <Link
          to="/login?next=/orders"
          className="mt-6 inline-block rounded-xl bg-[var(--sb-brand)] px-6 py-2.5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)]"
        >
          {t("orders.loginCta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-[var(--sb-font-display)] text-2xl font-semibold">{t("orders.title")}</h1>
          <p className="mt-1 text-xs text-[var(--sb-ink-40)]">{t("orders.sub")}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-xl border border-[var(--sb-line)] bg-white px-4 py-2 text-xs font-medium text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
        >
          {t("orders.newInquiry")}
        </button>
      </div>

      {showForm && (
        <form
          className="mt-4 space-y-2.5 rounded-2xl border border-[var(--sb-line)] bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!demand.trim()) return alert(t("orders.needDemand"));
            const q = qty.trim() && /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : undefined;
            createMut.mutate({
              demand: demand.trim(),
              quantity: q,
              destination: dest.trim() || undefined,
            });
          }}
        >
          <p className="text-sm font-medium">{t("orders.newInquiryTitle")}</p>
          <textarea
            value={demand}
            onChange={(e) => setDemand(e.target.value)}
            placeholder={t("orders.demandPh")}
            rows={3}
            className="w-full rounded-xl border border-[var(--sb-line)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--sb-brand)]"
          />
          <div className="flex gap-2">
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={t("orders.qtyPh")}
              className="h-10 flex-1 rounded-xl border border-[var(--sb-line)] bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--sb-brand)]"
            />
            <input
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder={t("orders.destPh")}
              className="h-10 flex-1 rounded-xl border border-[var(--sb-line)] bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--sb-brand)]"
            />
            <button
              type="submit"
              disabled={createMut.isPending}
              className="h-10 shrink-0 rounded-xl bg-[var(--sb-brand)] px-5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)] disabled:opacity-40"
            >
              {createMut.isPending ? t("orders.submitting") : t("orders.submitInquiry")}
            </button>
          </div>
          {createMut.isError && <p className="text-xs text-[#b45309]">{t("orders.createFail")}</p>}
        </form>
      )}

      <div className="mt-5 space-y-3">
        {listQ.isLoading ? (
          <p className="py-10 text-center text-sm text-[var(--sb-ink-40)]">…</p>
        ) : !listQ.data?.length ? (
          <p className="rounded-2xl border border-dashed border-[var(--sb-line)] py-12 text-center text-sm text-[var(--sb-ink-40)]">
            {t("orders.empty")}
          </p>
        ) : (
          listQ.data.map((o) => (
            <Link
              key={o.id}
              to={`/orders/${o.id}`}
              className="flex items-center gap-4 rounded-2xl border border-[var(--sb-line)] bg-white p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]"
            >
              {o.productImage && (
                <img src={o.productImage} alt="" referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 rounded-lg border border-[var(--sb-line)] object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{o.productTitle || o.orderNo}</p>
                <p className="mt-1 text-xs text-[var(--sb-ink-40)]">
                  {t("orders.orderNo")} {o.orderNo}
                  {o.quantity ? ` · ${t("orders.pieces", { n: o.quantity })}` : ""}
                  {o.destination ? ` · ${o.destination}` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${o.status === "cancelled" ? "bg-black/5 text-[var(--sb-ink-40)]" : "bg-[var(--sb-brand-soft)] text-[var(--sb-brand)]"}`}>
                {t(`orders.status.${o.status}`)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
