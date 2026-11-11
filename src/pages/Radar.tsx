import { Link } from "react-router";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useReveal } from "@/hooks/useReveal";
import { useT } from "@/i18n";

type RadarItem = {
  id: number;
  title: string;
  titleEn: string | null;
  signalSource: "amazon" | "tiktok";
  signalText: string;
  signalUrl: string | null;
  signalDate: string;
  imageUrl: string | null;
  retailPriceUsd: number | null;
  factoryPriceMin: number | null;
  factoryPriceMax: number | null;
  upstreamCount: number | null;
  vettedCount: number | null;
  topSales: number | null;
  note: string | null;
  trendDirection: string | null;
  trendCheckedAt: string | null;
};

// Google Trends 五年趋势链接——买家点开自己验证，来源真实、永不依赖非官方抓取
function gtUrl(titleEn: string | null, fallback: string): string {
  return `https://trends.google.com/trends/explore?date=today%205-y&q=${encodeURIComponent(titleEn || fallback)}`;
}

const SOURCE_DOT = { amazon: "#e07b39", tiktok: "#6d28d9" } as const;

function fmtSales(n: number | null, lang: string): string | null {
  if (n == null || n <= 0) return null;
  if (lang !== "zh") {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`;
    if (n >= 1000) return `${Math.floor(n / 1000)}K+`;
    return `${n}`;
  }
  if (n >= 100000) return "10万+";
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万+`;
  return `${n}`;
}

export function RadarCard({ it, i }: { it: RadarItem; i: number }) {
  const { lang, t } = useT();
  const dot = SOURCE_DOT[it.signalSource];
  const srcLabel = it.signalSource === "amazon" ? t("radar.sourceAmazon") : t("radar.sourceTiktok");
  const sales = fmtSales(it.topSales, lang);
  return (
    <article
      className="sb-reveal flex flex-col border border-[var(--sb-rule)] bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--sb-brand)] hover:shadow-[0_14px_34px_-16px_rgba(21,37,49,0.35)]"
      style={{ ["--sb-delay" as string]: `${Math.min(i, 8) * 60}ms` }}
    >
      {/* 产品代表图：上游实时搜索首图，加载失败整块隐藏（宁可没图，不摆破图） */}
      {it.imageUrl && (
        <div className="-mx-5 -mt-5 mb-4 h-40 overflow-hidden border-b border-[var(--sb-line)] bg-[var(--sb-paper)]">
          <img
            src={it.imageUrl}
            alt={it.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={(e) => {
              const wrap = e.currentTarget.parentElement;
              if (wrap) wrap.style.display = "none";
            }}
          />
        </div>
      )}

      {/* 顶行：台账序号 + 信号源 */}
      <div className="flex items-center justify-between gap-3">
        <span className="sb-index text-[11px] text-[var(--sb-ink-40)]">
          {String(i + 1).padStart(2, "0")}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--sb-ink-60)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
          {srcLabel}
        </span>
      </div>

      {/* 品名 */}
      <h3 className="sb-display mt-3 text-[21px] leading-snug text-[var(--sb-ink)]">{lang !== "zh" && it.titleEn ? it.titleEn : it.title}</h3>
      {it.titleEn && lang !== "en" && (
        <p className="mt-1 line-clamp-1 text-[11px] tracking-[0.04em] text-[var(--sb-ink-40)]">{it.titleEn}</p>
      )}

      {/* 海外信号：真实出处 + 日期，可点击验证 */}
      <p className="mt-3 line-clamp-2 min-h-[2.6em] text-xs leading-relaxed text-[var(--sb-ink-60)]">
        {it.signalUrl ? (
          <a href={it.signalUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--sb-brand)]">
            {it.signalText}
          </a>
        ) : (
          it.signalText
        )}
      </p>

      {/* 趋势标注：人工查 GT 标注（涨/平/跌 + 检查日期），没查过不显示；右侧挂 GT 原链可自查 */}
      <div className="mt-2 flex items-center justify-between gap-2">
        {it.trendDirection ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              it.trendDirection === "rising"
                ? "bg-emerald-50 text-emerald-700"
                : it.trendDirection === "falling"
                  ? "bg-red-50 text-red-600"
                  : "bg-black/5 text-[var(--sb-ink-60)]"
            }`}
          >
            {t(`radar.trend.${it.trendDirection}`)}
            {it.trendCheckedAt ? ` · ${it.trendCheckedAt}` : ""}
          </span>
        ) : (
          <span />
        )}
        <a
          href={gtUrl(it.titleEn, it.title)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-[10px] font-medium text-[var(--sb-ink-40)] underline decoration-dotted underline-offset-2 hover:text-[var(--sb-brand)]"
        >
          {t("radar.gtLink")}
        </a>
      </div>

      {/* 价格底板：纸色数据块，两栏大数字 */}
      <div className="mt-4 grid grid-cols-2 gap-x-3 bg-[var(--sb-paper)] px-3.5 py-3">
        {it.factoryPriceMin != null && it.factoryPriceMax != null ? (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sb-ink-40)]">{t("radar.exwBand")}</span>
            <div className="sb-num mt-1 text-[17px] font-semibold leading-none text-[var(--sb-ink)]">
              ¥{it.factoryPriceMin}–{it.factoryPriceMax}
            </div>
          </div>
        ) : (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sb-ink-40)]">{t("radar.exwAsk")}</span>
            <div className="mt-1 text-[15px] font-semibold leading-none text-[var(--sb-ink)]">{t("radar.askMe")}</div>
          </div>
        )}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sb-ink-40)]">
            {it.retailPriceUsd != null ? t("radar.retailRef") : t("radar.vettedRef")}
          </span>
          <div className="sb-num mt-1 text-[17px] font-semibold leading-none text-[var(--sb-ink)]">
            {it.retailPriceUsd != null ? `$${it.retailPriceUsd}` : t("radar.vettedCount", { n: it.vettedCount ?? 0 })}
          </div>
        </div>
      </div>

      {it.note && (
        <p className="mt-3.5 border-l-2 border-[var(--sb-brand)]/50 pl-3 text-[11px] leading-relaxed text-[var(--sb-ink-60)]">
          <span className="font-semibold text-[var(--sb-ink)]">{t("radar.buyerNote")}</span>
          {it.note}
        </p>
      )}

      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between gap-2 border-t border-[var(--sb-line)] pt-3.5">
          <span className="text-[10px] text-[var(--sb-ink-40)]">
            {t("radar.signalLine", { date: it.signalDate })}
            {sales ? t("radar.topSalesSuffix", { n: sales }) : ""}
          </span>
          <Link
            to={`/buyer?radar=${it.id}&prefill=${encodeURIComponent(t("radar.ctaPrefill", { title: lang !== "zh" && it.titleEn ? it.titleEn : it.title }))}`}
            className="shrink-0 border border-[var(--sb-rule)] px-3.5 py-1.5 text-xs font-semibold text-[var(--sb-ink)] transition-colors duration-150 hover:border-[var(--sb-brand)] hover:bg-[var(--sb-brand)] hover:text-white"
          >
            {t("radar.cta")}
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function Radar() {
  const { t, lang } = useT();
  const q = trpc.radar.list.useQuery({ locale: lang }, { staleTime: 60_000 });
  const [filter, setFilter] = useState<"all" | "amazon" | "tiktok">("all");
  const pageRef = useReveal<HTMLDivElement>();

  const items = (q.data?.items ?? []) as RadarItem[];
  const shown = filter === "all" ? items : items.filter((x) => x.signalSource === filter);

  return (
    <div ref={pageRef} className="space-y-8">
      <header className="sb-reveal sb-rule pt-4">
        <span className="sb-eyebrow flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--sb-brand)]" />
          {t("radar.eyebrowKicker")} · {t("radar.eyebrowTitle")}
        </span>
        <h1 className="sb-display mt-4 text-3xl tracking-tight sm:text-[40px] sm:leading-[1.15]">
          {t("radar.h1")}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sb-ink-60)]">
          {t("radar.intro")}
        </p>
      </header>

      <div className="sb-reveal flex flex-wrap items-center gap-x-1 gap-y-2 border-y border-[var(--sb-line)] py-2.5">
        {([
          ["all", t("radar.filterAll")],
          ["amazon", t("radar.filterAmazon")],
          ["tiktok", t("radar.filterTiktok")],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === k
                ? "text-[var(--sb-brand)] underline underline-offset-8 decoration-2"
                : "text-[var(--sb-ink-60)] hover:text-[var(--sb-ink)]"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto whitespace-nowrap text-xs text-[var(--sb-ink-40)]">
          {q.isLoading ? t("radar.loading") : t("radar.countLine", { n: shown.length })}
        </span>
      </div>

      {q.isError ? (
        <p className="sb-reveal sb-rule pt-4 text-sm text-[var(--sb-ink-60)]">
          {t("radar.error")}
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((it, i) => (
            <RadarCard key={it.id} it={it} i={i} />
          ))}
        </div>
      )}

      <p className="border-t border-[var(--sb-line)] pt-4 text-[11px] leading-relaxed text-[var(--sb-ink-40)]">
        {t("radar.footnote")}
      </p>
    </div>
  );
}
