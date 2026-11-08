// M3b 订单详情：状态时间线（事件留痕）+ 报价单拆解 + 买家动作（接受报价/确认收货/取消）
import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";
import { ORDER_FLOW, type OrderStatus, type OrderQuote } from "@contracts/orderFlow";

const WHY_KEYS = ["price", "leadtime", "sample", "audit", "comm", "other"] as const;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { me, loading } = useAuth();
  const { t, lang } = useT();
  const nav = useNavigate();
  const utils = trpc.useUtils();
  const q = trpc.orders.detail.useQuery({ orderId: Number(id) }, { enabled: !!me });
  const actMut = trpc.orders.act.useMutation({
    onSuccess: () => utils.orders.detail.invalidate({ orderId: Number(id) }),
  });
  // 选择理由埋点：点"接受报价"先展开一键标签面板（选填，可跳过）
  const [whyOpen, setWhyOpen] = useState(false);
  const [whyTags, setWhyTags] = useState<string[]>([]);
  const [whyNote, setWhyNote] = useState("");
  const confirmQuote = (withWhy: boolean) =>
    actMut.mutate({
      orderId: Number(id),
      action: "confirmQuote",
      ...(withWhy && (whyTags.length || whyNote.trim())
        ? { decisionTags: whyTags, decisionNote: whyNote.trim() || undefined }
        : {}),
    });

  if (loading || (!me ? false : q.isLoading)) return null;
  if (!me) {
    nav(`/login?next=/orders/${id}`, { replace: true });
    return null;
  }
  const o = q.data;
  if (!o) return <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--sb-ink-40)]">404</p>;

  const status = o.status as OrderStatus;
  const flowIdx = ORDER_FLOW.indexOf(status);
  const quote = (o.quote ?? null) as OrderQuote | null;
  const fmtDate = (d: any) => new Date(d).toLocaleString(lang === "en" ? "en-US" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/orders" className="text-xs font-medium text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline">
        {t("orders.detailBack")}
      </Link>

      {/* 头部：商品快照 + 当前状态 */}
      <div className="mt-3 rounded-2xl border border-[var(--sb-line)] bg-white p-5">
        <div className="flex items-start gap-4">
          {o.productImage && (
            <img src={o.productImage} alt="" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-lg border border-[var(--sb-line)] object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold leading-snug">{o.productTitle || o.orderNo}</h1>
            <p className="mt-1 text-xs text-[var(--sb-ink-40)]">
              {t("orders.orderNo")} {o.orderNo} · {t("orders.createdAt")} {fmtDate(o.createdAt)}
              {o.quantity ? ` · ${t("orders.pieces", { n: o.quantity })}` : ""}
              {o.destination ? ` · ${o.destination}` : ""}
            </p>
            {o.offerId && (
              <Link to={`/products/${o.offerId}`} className="mt-1.5 inline-block text-xs font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline">
                {t("orders.fromProduct")} {t("orders.viewProduct")}
              </Link>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${status === "cancelled" ? "bg-black/5 text-[var(--sb-ink-40)]" : "bg-[var(--sb-brand-soft)] text-[var(--sb-brand)]"}`}>
            {t(`orders.status.${status}`)}
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--sb-ink-60)]">{t(`orders.statusDesc.${status}`)}</p>
        {o.demand && (
          <p className="mt-3 rounded-lg bg-[var(--sb-paper)] px-3 py-2 text-xs leading-relaxed text-[var(--sb-ink-60)]">
            <span className="font-medium">{t("orders.demandLabel")}：</span>
            {o.demand}
          </p>
        )}
      </div>

      {/* 主流程进度条 */}
      {status !== "cancelled" && (
        <div className="mt-4 rounded-2xl border border-[var(--sb-line)] bg-white p-5">
          <div className="flex items-center">
            {ORDER_FLOW.map((s, i) => (
              <div key={s} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${
                      i < flowIdx
                        ? "bg-[var(--sb-brand)] text-white"
                        : i === flowIdx
                          ? "bg-[var(--sb-brand)] text-white ring-4 ring-[var(--sb-brand)]/15"
                          : "border border-[var(--sb-line)] text-[var(--sb-ink-40)]"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className={`mt-1.5 whitespace-nowrap text-[10px] ${i <= flowIdx ? "font-medium text-[var(--sb-brand)]" : "text-[var(--sb-ink-40)]"}`}>
                    {t(`orders.status.${s}`)}
                  </span>
                </div>
                {i < ORDER_FLOW.length - 1 && (
                  <div className={`mx-1 mb-5 h-px flex-1 ${i < flowIdx ? "bg-[var(--sb-brand)]" : "bg-[var(--sb-line)]"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 报价单：快照展示，佣金拆解逐项列明 */}
      {quote && (
        <div className="mt-4 rounded-2xl border border-[var(--sb-line)] bg-white p-5">
          <h2 className="text-sm font-semibold">{t("orders.quoteTitle")}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {quote.exwUnitPriceCny != null && (
              <div className="flex justify-between"><dt className="text-[var(--sb-ink-60)]">{t("orders.quoteExw")}</dt><dd className="font-medium">¥{quote.exwUnitPriceCny}</dd></div>
            )}
            {quote.goodsTotalCny != null && (
              <div className="flex justify-between"><dt className="text-[var(--sb-ink-60)]">{t("orders.quoteGoods")}</dt><dd className="font-medium">¥{quote.goodsTotalCny}</dd></div>
            )}
            {quote.freightUsd != null && (
              <div className="flex justify-between"><dt className="text-[var(--sb-ink-60)]">{t("orders.quoteFreight")}{quote.channel ? ` · ${quote.channel}` : ""}</dt><dd className="font-medium">${quote.freightUsd}</dd></div>
            )}
            {quote.dutyUsd != null && (
              <div className="flex justify-between"><dt className="text-[var(--sb-ink-60)]">{t("orders.quoteDuty")}</dt><dd className="font-medium">${quote.dutyUsd}</dd></div>
            )}
            {quote.commissionUsd != null && (
              <div className="flex justify-between">
                <dt className="text-[var(--sb-ink-60)]">
                  {t("orders.quoteCommission")}{quote.commissionRate != null ? ` (${(quote.commissionRate * 100).toFixed(1)}%)` : ""}
                </dt>
                <dd className="font-medium">${quote.commissionUsd}</dd>
              </div>
            )}
            {quote.totalUsd != null && (
              <div className="flex justify-between border-t border-[var(--sb-line)] pt-2">
                <dt className="font-semibold">{t("orders.quoteTotal")}</dt>
                <dd className="font-semibold text-[var(--sb-brand)]">${quote.totalUsd}</dd>
              </div>
            )}
          </dl>
          <div className="mt-3 space-y-1 text-[11px] leading-relaxed text-[var(--sb-ink-40)]">
            {quote.fxRate != null && <p>{t("orders.quoteFx", { rate: quote.fxRate })}</p>}
            {quote.etaDays && <p>{t("orders.quoteEta")}: {quote.etaDays}</p>}
            {quote.minFeeApplied && <p>{t("orders.quoteMinFee")}</p>}
            {quote.note && <p className="text-[#92610a]">{t("orders.quoteNote")}: {quote.note}</p>}
          </div>
        </div>
      )}

      {/* 买家动作区 */}
      {status === "quoted" && (
        <div className="mt-4 rounded-2xl border border-[#e9d5a1] bg-[#fdf6e3] p-4">
          <p className="text-xs leading-relaxed text-[#92610a]">
            <span className="mr-1.5 rounded bg-[#92610a]/10 px-1.5 py-0.5 text-[10px] font-semibold">{t("orders.payPendingTag")}</span>
            {t("orders.payPending")}
          </p>
          {whyOpen ? (
            <div className="mt-3 rounded-xl border border-[#e9d5a1] bg-white p-3.5">
              <p className="text-xs font-medium text-[var(--sb-ink)]">{t("orders.whyTitle")}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {WHY_KEYS.map((k) => {
                  const on = whyTags.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setWhyTags((s) => (on ? s.filter((x) => x !== k) : [...s, k]))}
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        on ? "border-[var(--sb-brand)] bg-[var(--sb-brand-soft)] font-semibold text-[var(--sb-brand)]" : "border-[var(--sb-line)] text-[var(--sb-ink-60)] hover:border-[var(--sb-brand)]"
                      }`}
                    >
                      {t(`orders.whyTags.${k}`)}
                    </button>
                  );
                })}
              </div>
              <input
                value={whyNote}
                onChange={(e) => setWhyNote(e.target.value)}
                maxLength={120}
                placeholder={t("orders.whyPlaceholder")}
                className="mt-2.5 w-full rounded-lg border border-[var(--sb-line)] px-3 py-2 text-xs outline-none focus:border-[var(--sb-brand)]"
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => confirmQuote(true)}
                  disabled={actMut.isPending}
                  className="flex-1 rounded-xl bg-[var(--sb-brand)] py-2.5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)] disabled:opacity-40"
                >
                  {t("orders.whyConfirm")}
                </button>
                <button
                  onClick={() => confirmQuote(false)}
                  disabled={actMut.isPending}
                  className="rounded-xl border border-[var(--sb-line)] px-3.5 py-2.5 text-xs text-[var(--sb-ink-60)] hover:text-[var(--sb-ink)] disabled:opacity-40"
                >
                  {t("orders.whySkip")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setWhyOpen(true)}
              disabled={actMut.isPending}
              className="mt-3 w-full rounded-xl bg-[var(--sb-brand)] py-2.5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)] disabled:opacity-40"
            >
              {t("orders.actQuote")}
            </button>
          )}
        </div>
      )}
      {status === "shipped" && (
        <button
          onClick={() => actMut.mutate({ orderId: o.id, action: "confirmReceive" })}
          disabled={actMut.isPending}
          className="mt-4 w-full rounded-xl bg-[var(--sb-brand)] py-2.5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)] disabled:opacity-40"
        >
          {t("orders.actReceive")}
        </button>
      )}
      {(status === "inquiry" || status === "quoted" || status === "pending_payment") && (
        <button
          onClick={() => { if (confirm(t("orders.actCancel") + "?")) actMut.mutate({ orderId: o.id, action: "cancel" }); }}
          disabled={actMut.isPending}
          className="mt-3 w-full rounded-xl border border-[var(--sb-line)] py-2 text-xs text-[var(--sb-ink-40)] hover:text-[var(--sb-ink)] disabled:opacity-40"
        >
          {t("orders.actCancel")}
        </button>
      )}

      {/* 流转留痕：每一次状态变化都有据可查 */}
      <div className="mt-4 rounded-2xl border border-[var(--sb-line)] bg-white p-5">
        <h2 className="text-sm font-semibold">{t("orders.timeline")}</h2>
        <ol className="mt-3 space-y-2.5">
          {o.events.map((e: any) => (
            <li key={e.id} className="flex items-baseline gap-3 text-xs">
              <span className="shrink-0 text-[var(--sb-ink-40)]">{fmtDate(e.createdAt)}</span>
              <span className="font-medium text-[var(--sb-ink)]">{t(`orders.status.${e.toStatus}`)}</span>
              {e.note && <span className="min-w-0 flex-1 truncate text-[var(--sb-ink-40)]">{e.note}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
