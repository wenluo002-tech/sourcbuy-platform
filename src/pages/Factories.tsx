import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useT } from "@/i18n";

const TIERS = ["金标", "银标", "铜标", "优选", "培育"];
const CERTS = [
  { v: "sgs", l: "SGS" },
  { v: "intertek", l: "Intertek" },
  { v: "tuv", l: "TÜV" },
  { v: "cti", l: "CTI" },
];

export default function Factories() {
  const { t } = useT();
  const [params] = useSearchParams();
  const [keyword, setKeyword] = useState(params.get("keyword") ?? "");
  const [tier, setTier] = useState("");
  const [cert, setCert] = useState("");
  const [location, setLocation] = useState("");
  const [page, setPage] = useState(1);

  const q = trpc.factories.list.useQuery({
    keyword: keyword || undefined,
    tier: tier || undefined,
    cert: cert || undefined,
    location: location || undefined,
    page,
    pageSize: 20,
  });

  const totalPages = q.data ? Math.ceil(q.data.total / 20) : 1;
  // 与试算器同一套表单控件语言：1px 细边、6px 圆角、焦点品牌蓝
  const sel =
    "rounded-md border border-black/10 bg-white px-3 py-2.5 text-sm transition-colors duration-150 placeholder:text-black/30 hover:border-black/20 focus-visible:outline-2 focus-visible:outline-[var(--sb-brand)]";

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="sb-rule pt-4">
        <span className="sb-eyebrow">Vetted Factory Index</span>
        <h1 className="sb-display mt-4 text-3xl tracking-tight sm:text-[40px]">{t("factories.h1")}</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-black/55">
          {t("factories.sub")}
        </p>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap gap-2">
        <input
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
          placeholder={t("factories.searchPh")}
          className={sel + " min-w-48"}
        />
        <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }} className={sel}>
          <option value="">{t("factories.allTiers")}</option>
          {TIERS.map((tierZh) => (
            <option key={tierZh} value={tierZh}>{t(`home.tierName.${tierZh}`)}</option>
          ))}
        </select>
        <select value={cert} onChange={(e) => { setCert(e.target.value); setPage(1); }} className={sel}>
          <option value="">{t("factories.allCerts")}</option>
          {CERTS.map((c) => (
            <option key={c.v} value={c.v}>
              {c.l}
            </option>
          ))}
        </select>
        <input
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            setPage(1);
          }}
          placeholder={t("factories.locationPh")}
          className={sel + " w-32"}
        />
      </div>

      <p className="text-xs text-black/45">
        {q.isLoading ? t("factories.loading") : t("factories.totalLine", { n: q.data?.total ?? 0 })}
      </p>

      {!q.isLoading && q.data?.total === 0 && (
        <div className="rounded-xl border border-dashed border-black/15 bg-white p-8 text-center">
          <p className="font-medium">{t("factories.emptyTitle")}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-black/55">
            {t("factories.emptyBody")}
          </p>
          <button
            onClick={() => { setKeyword(""); setTier(""); setCert(""); setLocation(""); setPage(1); }}
            className="sb-pill mt-5 border border-black/15 px-5 py-2 text-sm hover:bg-black/[0.03]"
          >
            {t("factories.emptyReset")}
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data?.rows ?? []).map((f) => (
          <Link
            key={f.id}
            to={`/factories/${f.id}`}
            className="group flex flex-col rounded-xl border border-black/10 bg-white p-5 transition-all duration-150 hover:border-black/20 hover:shadow-[0_8px_24px_-12px_rgba(31,74,148,0.18)]"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="line-clamp-1 font-semibold tracking-tight group-hover:text-[var(--sb-brand)]">
                {f.name}
              </h3>
              <span className="sb-num shrink-0 text-lg font-bold leading-none text-[var(--sb-brand)]">
                {f.score}
              </span>
            </div>
            {(f as any).masked && (
              <p className="mt-1.5 flex items-center gap-1 text-[10px] text-black/40">
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {t("factories.maskedHint")}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {f.tier && (
                <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-black/60">{t(`home.tierName.${f.tier}`)}</span>
              )}
              {f.isSuper && (
                <span className="rounded bg-[var(--sb-brand-soft)] px-1.5 py-0.5 text-[var(--sb-brand)]">{t("factories.superFactory")}</span>
              )}
              {f.medal && f.medal !== "无牌工厂" && (
                <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-black/60">
                  {f.medal}
                  {f.medalLevel ?? ""}
                </span>
              )}
            </div>
            <p className="sb-num mt-2.5 text-xs text-black/45">
              {[f.location, f.years ? `${Number(f.years)}${t("factories.yearsSuffix")}` : null, f.repurchaseRate ? t("factories.repurchase", { n: Number(f.repurchaseRate) }) : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="sb-pill border border-black/15 px-5 py-2 text-sm hover:bg-black/[0.03] disabled:opacity-40"
          >
            {t("factories.prev")}
          </button>
          <span className="sb-num text-sm text-black/45">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="sb-pill border border-black/15 px-5 py-2 text-sm hover:bg-black/[0.03] disabled:opacity-40"
          >
            {t("factories.next")}
          </button>
        </div>
      )}
    </div>
  );
}
