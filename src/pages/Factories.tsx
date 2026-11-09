import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useT } from "@/i18n";
import { useAuth } from "@/auth";

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

      <TempCheck sel={sel} />

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

/** 临时查厂（v66）：库外工厂实时核查。结果绝不写入严选库——大字标注，分数公式全公开。 */
function TempCheck({ sel }: { sel: string }) {
  const { t } = useT();
  const { me } = useAuth();
  const [name, setName] = useState("");
  const m = trpc.factories.tempCheck.useMutation();
  const r = m.data;

  const factRow = (label: string, value: string | null) => (
    <div key={label} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-black/45">{label}</span>
      <span className="text-right font-medium text-black/80">{value ?? t("factories.tempMissing")}</span>
    </div>
  );

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5">
      <h2 className="font-semibold tracking-tight">{t("factories.tempTitle")}</h2>
      <p className="mt-1 text-xs leading-relaxed text-black/50">{t("factories.tempDesc")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("factories.tempPh")}
          className={sel + " min-w-64 flex-1"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && me && name.trim().length >= 4 && !m.isPending) m.mutate({ name: name.trim() });
          }}
        />
        {me ? (
          <button
            disabled={name.trim().length < 4 || m.isPending}
            onClick={() => m.mutate({ name: name.trim() })}
            className="sb-pill bg-[var(--sb-brand)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {m.isPending ? t("factories.tempChecking") : t("factories.tempBtn")}
          </button>
        ) : (
          <Link
            to="/login?next=%2Ffactories"
            className="sb-pill border border-black/15 px-5 py-2.5 text-sm hover:bg-black/[0.03]"
          >
            {t("factories.tempLogin")}
          </Link>
        )}
      </div>

      {m.isError && (
        <p className="mt-3 text-sm text-[var(--sb-warn)]">{t("factories.tempUpstream")}</p>
      )}

      {r && !r.ok && (
        <p className="mt-3 text-sm text-[var(--sb-warn)]">
          {r.reason === "daily_cap"
            ? t("factories.tempDailyCap")
            : r.reason === "fuse"
              ? t("factories.tempFuse")
              : r.reason === "invalid"
                ? t("factories.tempPh")
                : t("factories.tempUpstream")}
        </p>
      )}

      {r?.ok && (
        <div className="mt-4 rounded-lg border border-black/10">
          {/* 大字免责横幅：非严选库正式评分 */}
          <div className="rounded-t-lg bg-[var(--sb-warn)]/10 px-4 py-2.5 text-xs font-semibold text-[var(--sb-warn)]">
            {t("factories.tempBanner")}
            {r.report.cached && <span className="ml-2 font-normal text-black/45">· {t("factories.tempCached")}</span>}
          </div>

          {r.report.status === "not_found" && (
            <p className="px-4 py-4 text-sm leading-relaxed text-black/60">{t("factories.tempNotFound")}</p>
          )}
          {r.report.status === "mismatch" && (
            <p className="px-4 py-4 text-sm leading-relaxed text-black/60">
              {t("factories.tempMismatch", { title: r.report.matchedTitle ?? "?" })}
            </p>
          )}

          {r.report.status === "ok" && (
            <div className="grid gap-5 px-4 py-4 sm:grid-cols-2">
              {/* 左：事实 */}
              <div>
                <p className="mb-1 text-sm font-semibold">{r.report.matchedTitle}</p>
                <div className="divide-y divide-black/[0.06]">
                  {factRow(t("factories.tempFactYears"), r.report.facts.years != null ? `${r.report.facts.years}${t("factories.tempYearsSuffix")}` : null)}
                  {factRow(t("factories.tempFactRegion"), r.report.facts.region)}
                  {factRow(t("factories.tempFactLevel"), r.report.facts.level)}
                  {factRow(t("factories.tempFactMode"), r.report.facts.productionType)}
                  {factRow(t("factories.tempFactEmp"), r.report.facts.employeeCount != null ? `${r.report.facts.employeeCount}${t("factories.tempEmpSuffix")}` : null)}
                  {factRow(t("factories.tempFactArea"), r.report.facts.areaSqm != null ? `${r.report.facts.areaSqm}${t("factories.tempAreaSuffix")}` : null)}
                  {factRow(t("factories.tempFactCert"), r.report.facts.cert)}
                  {factRow(t("factories.tempFactCustom"), r.report.facts.customService == null ? null : r.report.facts.customService ? t("factories.tempYes") : t("factories.tempNo"))}
                  {factRow(t("factories.tempFactQc"), r.report.facts.qualityControl)}
                  {factRow(t("factories.tempFactCredit"), r.report.facts.creditCode)}
                  {factRow(t("factories.tempFactHome"), r.report.facts.home)}
                </div>
              </div>
              {/* 右：初核分 + 拆解 */}
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-black/45">{t("factories.tempScoreLabel")}</span>
                  <span className="sb-num text-3xl font-bold text-[var(--sb-warn)]">{r.report.score}</span>
                  <span className="text-xs text-black/35">/ 100</span>
                </div>
                <p className="mb-2 mt-3 text-xs font-medium text-black/45">{t("factories.tempBreakdown")}</p>
                <div className="space-y-2">
                  {r.report.breakdown.map((b) => (
                    <div key={b.key}>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-black/60">
                          {t(`factories.tempBd${b.key[0].toUpperCase()}${b.key.slice(1)}`)}
                          <span className="ml-1 text-black/35">({b.fact || t("factories.tempMissing")})</span>
                        </span>
                        <span className="sb-num shrink-0 font-medium text-black/70">
                          {b.points}/{b.max}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-black/[0.06]">
                        <div
                          className="h-1.5 rounded-full bg-[var(--sb-brand)]"
                          style={{ width: `${(b.points / b.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
