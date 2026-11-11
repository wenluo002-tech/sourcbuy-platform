import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { SCORING_FORMULA } from "@contracts/scoring";
import { useT } from "@/i18n";

const IMAGE_GROUP_KEYS = ["product", "workshop", "equipment", "warehouse", "gate", "catalog"] as const;

const SCORE_KEYS = ["qualityCert", "factoryPower", "trustYears", "repurchase", "production", "service", "sales"] as const;
/** scores 行存在但 7 维全空 = 子分尚未核实（等同无子分），走占位卡而不是渲染一张全空的图 */
const hasScoreDims = (s: any) => !!s && SCORE_KEYS.some((k) => s[k] != null);

export default function FactoryDetail() {
  const { id } = useParams<{ id: string }>();
  const q = trpc.factories.detail.useQuery({ id: Number(id) });
  const { t } = useT();

  if (q.isLoading) return <p className="text-black/45">{t("factoryDetail.loading")}</p>;
  if (!q.data) return <p className="text-black/45">{t("factoryDetail.notFound")}</p>;
  const f = q.data;

  return <FactoryDetailView f={f} />;
}

function FactoryDetailView({ f }: { f: any }) {
  const { t } = useT();
  // 灯箱：所有分组图片拍平成一条序列，点缩略图放大，支持左右切换
  const [viewer, setViewer] = useState<number | null>(null);
  const flatImages = useMemo(() => {
    const out: Array<{ src: string; group: string }> = [];
    for (const k of IMAGE_GROUP_KEYS) {
      const label = t(`factoryDetail.photoGroups.${k}`) as string;
      const list = ((f.images as Record<string, string[]>)?.[k] ?? [])
        .filter((u: string) => /^https?:\/\//i.test(u))
        .slice(0, 6);
      for (const src of list) out.push({ src, group: label });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.images, t]);

  useEffect(() => {
    if (viewer === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewer(null);
      if (e.key === "ArrowLeft") setViewer((v) => (v === null ? v : (v - 1 + flatImages.length) % flatImages.length));
      if (e.key === "ArrowRight") setViewer((v) => (v === null ? v : (v + 1) % flatImages.length));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [viewer !== null, flatImages.length]);

  const facts: Array<[string, string | null]> = [
    [t("factoryDetail.factLabels.location"), [f.province, f.city, f.district].filter(Boolean).join(" ") || f.location],
    [t("factoryDetail.factLabels.years"), f.years ? `${Number(f.years)}${t("factoryDetail.yearsSuffix")}` : null],
    [t("factoryDetail.factLabels.employees"), f.employeeCount ? `${f.employeeCount}${t("factoryDetail.peopleSuffix")}` : null],
    [t("factoryDetail.factLabels.area"), f.areaSqm ? `${f.areaSqm} ㎡` : null],
    [t("factoryDetail.factLabels.replyRate"), f.replyRate ? `${Number(f.replyRate)}%` : null],
    [t("factoryDetail.factLabels.repurchase"), f.repurchaseRate ? `${Number(f.repurchaseRate)}%` : null],
    [t("factoryDetail.factLabels.monthlyBuyers"), f.monthlyBuyers ? `${f.monthlyBuyers}` : null],
    [t("factoryDetail.factLabels.oem"), f.oemMode],
    [t("factoryDetail.factLabels.prodType"), f.productionType],
    [t("factoryDetail.factLabels.service"), f.serviceCapability],
    [t("factoryDetail.factLabels.cert"), f.cert],
  ];

  return (
    <div className="space-y-6">
      <Link to="/factories" className="text-sm text-[var(--sb-brand)] hover:underline">
        {t("factoryDetail.back")}
      </Link>

      {f.isTrader && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          <span className="mr-1.5 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700">{t("factoryDetail.traderBadge")}</span>
          {t("factoryDetail.traderNotice")}
        </div>
      )}

      {(f as any).masked && (
        <div className="rounded-lg border border-[var(--sb-line)] bg-[var(--sb-paper)] px-4 py-3 text-sm leading-relaxed text-[var(--sb-ink-60)]">
          <span className="mr-1.5 inline-flex items-center gap-1 rounded bg-[var(--sb-brand-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--sb-brand)]">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            {t("factoryDetail.maskedBadge")}
          </span>
          {t("factoryDetail.maskedNotice")}
        </div>
      )}

      <div className="rounded-xl border border-black/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="sb-display text-2xl sm:text-3xl">
              {(f as any).masked ? t("chat.maskedName", { n: String(f.id).padStart(4, "0") }) : f.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {f.tier && <span className="rounded bg-[var(--sb-brand-soft)] px-2 py-0.5 font-medium text-[var(--sb-brand)]">{t(`home.tierName.${f.tier}`)}</span>}
              {f.isSuper && <span className="rounded bg-[var(--sb-brand-soft)] px-2 py-0.5 text-[var(--sb-brand)]">{t("factoryDetail.superFactory")}</span>}
              {f.medal && f.medal !== "无牌工厂" && (
                <span className="rounded bg-black/[0.05] px-2 py-0.5 text-black/60">{f.medal}{f.medalLevel ?? ""}</span>
              )}
              {[...new Set<string>((f.tags ?? []).filter((t: string) => t !== f.tier && !(f.isSuper && t === "超级工厂")))].map((t) => (
                <span key={t} className="rounded bg-black/[0.05] px-2 py-0.5 text-black/60">{t}</span>
              ))}
            </div>
          </div>
          <div className="text-right">
            {f.score != null ? (
              <div className="sb-num text-3xl font-bold text-[var(--sb-brand)]">{f.score}</div>
            ) : (
              <div className="text-sm font-semibold text-[var(--sb-warn)]">{t("factoryDetail.scorePending")}</div>
            )}
            <div className="text-xs text-black/45">{t("factoryDetail.scoreLabel")}</div>
          </div>
        </div>

        {f.review && (
          <p className="mt-4 rounded-lg bg-black/[0.03] p-4 text-sm leading-relaxed text-black/70">
            {f.review}
          </p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-black/35">{k}</dt>
                <dd className="mt-0.5 text-black/80">{v}</dd>
              </div>
            ))}
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/calculator"
            className="sb-pill bg-[var(--sb-brand)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--sb-brand-hover)]"
          >
            {t("factoryDetail.calcCta")}
          </Link>
        </div>
      </div>

      {/* 实拍图集：产品/车间/设备/仓库/大门/产品册 */}
      {flatImages.length > 0 && (
          <div className="rounded-xl border border-black/10 bg-white p-6">
            <h2 className="mb-4 font-semibold">{t("factoryDetail.photosTitle")}</h2>
            <div className="space-y-4">
              {IMAGE_GROUP_KEYS.map((k) => {
                const label = t(`factoryDetail.photoGroups.${k}`) as string;
                const list = flatImages
                  .map((img, idx) => ({ ...img, idx }))
                  .filter((img) => img.group === label);
                if (!list.length) return null;
                return (
                  <div key={k}>
                    <p className="mb-1.5 text-xs font-medium text-black/45">{label}</p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((img) => (
                        <button
                          key={img.idx}
                          type="button"
                          onClick={() => setViewer(img.idx)}
                          className="group/img relative cursor-zoom-in overflow-hidden rounded-lg border border-black/5 focus-visible:outline-2 focus-visible:outline-[var(--sb-brand)]"
                          aria-label={t("factoryDetail.zoomAria", { label })}
                        >
                          <img
                            src={img.src}
                            alt={label}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget.closest("button") as HTMLButtonElement | null)?.style.setProperty("display", "none");
                            }}
                            className="h-24 w-24 object-cover transition-transform duration-150 group-hover:scale-105 md:h-28 md:w-28"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-black/35">{t("factoryDetail.photoTip")}</p>
          </div>
        )}

      {hasScoreDims(f.scores) && (
        <div className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="mb-1 font-semibold">{t("factoryDetail.scoresTitle")}</h2>
          <p className="mb-4 text-xs leading-relaxed text-black/45">
            {t("factoryDetail.scoresIntro")}
          </p>
          <div className="space-y-3">
            {SCORE_KEYS.map((key) => {
              const label = t(`factoryDetail.scoreDims.${key}`) as string;
              const v = (f.scores as any)[key];
              const n = v != null ? Number(v) : null;
              if (n == null) return null;
              const dim = SCORING_FORMULA.dimensions.find((d) => d.key === key);
              const medRaw = (f as any).categoryMedians?.[key];
              const med = medRaw != null ? Number(medRaw) : null;
              const delta = med != null ? n - med : null;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-black/45" title={dim?.desc}>
                    {label}
                    {dim && (
                      <span className="ml-1 text-[10px] text-black/35">
                        {Math.round(dim.weight * 100)}%
                      </span>
                    )}
                  </span>
                  <div className="relative h-2 flex-1 rounded-full bg-black/[0.05]">
                    <div
                      className="h-2 rounded-full bg-[var(--sb-brand)]"
                      style={{ width: `${Math.min(100, n)}%` }}
                    />
                    {med != null && (
                      <div
                        className="absolute -top-1 h-4 w-0.5 bg-[var(--sb-warn)]"
                        style={{ left: `calc(${Math.min(100, med)}% - 1px)` }}
                        title={t("factoryDetail.medianTitle", { n: med.toFixed(1) })}
                      />
                    )}
                  </div>
                  <span className="w-10 text-right text-xs font-medium">{n}</span>
                  {delta != null && (
                    <span
                      className={`w-14 shrink-0 text-right text-[10px] font-medium ${
                        Math.abs(delta) < 0.05
                          ? "text-black/35"
                          : delta > 0
                            ? "text-emerald-700"
                            : "text-[var(--sb-warn)]"
                      }`}
                      title={t("factoryDetail.medianTitle", { n: med!.toFixed(1) })}
                    >
                      {Math.abs(delta) < 0.05
                        ? t("factoryDetail.flat")
                        : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {(f as any).categoryMedians && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-black/45">
              <span className="inline-block h-3 w-0.5 bg-[var(--sb-warn)]" />
              {t("factoryDetail.medianNote", { cat: (f as any).category })}
            </p>
          )}
          <details className="mt-4 text-xs text-black/45">
            <summary className="cursor-pointer select-none font-medium text-[var(--sb-brand)] hover:underline">
              {t("factoryDetail.dimDetailQ")}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
              {SCORING_FORMULA.dimensions.map((d) => (
                <li key={d.key}>
                  <span className="font-medium text-black/70">{t(`factoryDetail.scoreDims.${d.key}`)}</span>（{Math.round(d.weight * 100)}%）：{t(`factoryDetail.scoreDimDesc.${d.key}`)}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              {t("factoryDetail.verifiedNote", { n: SCORING_FORMULA.verifiedOn, e: SCORING_FORMULA.maxError })}
            </p>
          </details>
        </div>
      )}

      {/* 无子分的培育档新厂：不藏、不编，显式说明评分补全中 */}
      {!hasScoreDims(f.scores) && (
        <div className="rounded-xl border border-dashed border-black/15 bg-white p-6">
          <h2 className="mb-1 font-semibold">{t("factoryDetail.scorePendingLabel")}</h2>
          <p className="text-sm leading-relaxed text-black/50">{t("factoryDetail.scoresPendingDesc")}</p>
        </div>
      )}

      {/* 图片灯箱 */}
      {viewer !== null && flatImages[viewer] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setViewer(null)}
          role="dialog"
          aria-modal="true"
          aria-label="图片查看器"
        >
          <button
            type="button"
            onClick={() => setViewer(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white transition-colors hover:bg-white/20"
            aria-label={t("factoryDetail.closeAria")}
          >
            ×
          </button>
          {flatImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewer((viewer - 1 + flatImages.length) % flatImages.length); }}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition-colors hover:bg-white/20"
                aria-label={t("factoryDetail.prevAria")}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewer((viewer + 1) % flatImages.length); }}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition-colors hover:bg-white/20"
                aria-label={t("factoryDetail.nextAria")}
              >
                ›
              </button>
            </>
          )}
          <figure className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={flatImages[viewer].src}
              alt={flatImages[viewer].group}
              referrerPolicy="no-referrer"
              className="max-h-[82vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
            />
            <figcaption className="mt-3 text-center text-xs tracking-wide text-white/70">
              {flatImages[viewer].group} · {viewer + 1} / {flatImages.length}
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
