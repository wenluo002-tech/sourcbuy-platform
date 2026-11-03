import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { SCORING_FORMULA } from "@contracts/scoring";

const IMAGE_GROUPS = [
  ["product", "产品实拍"],
  ["workshop", "生产车间"],
  ["equipment", "生产设备"],
  ["warehouse", "仓储"],
  ["gate", "厂区"],
  ["catalog", "产品册"],
] as const;

const SCORE_LABELS: Array<[string, string]> = [
  ["qualityCert", "资质认证"],
  ["factoryPower", "工厂实力"],
  ["trustYears", "诚信年限"],
  ["repurchase", "复购表现"],
  ["production", "生产能力"],
  ["service", "服务能力"],
  ["sales", "出货活跃度"],
];

export default function FactoryDetail() {
  const { id } = useParams<{ id: string }>();
  const q = trpc.factories.detail.useQuery({ id: Number(id) });

  if (q.isLoading) return <p className="text-black/45">加载中…</p>;
  if (!q.data) return <p className="text-black/45">工厂不存在。</p>;
  const f = q.data;

  return <FactoryDetailView f={f} />;
}

function FactoryDetailView({ f }: { f: any }) {
  // 灯箱：所有分组图片拍平成一条序列，点缩略图放大，支持左右切换
  const [viewer, setViewer] = useState<number | null>(null);
  const flatImages = useMemo(() => {
    const out: Array<{ src: string; group: string }> = [];
    for (const [k, label] of IMAGE_GROUPS) {
      const list = ((f.images as Record<string, string[]>)?.[k] ?? [])
        .filter((u: string) => /^https?:\/\//i.test(u))
        .slice(0, 6);
      for (const src of list) out.push({ src, group: label });
    }
    return out;
  }, [f.images]);

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
    ["所在地区", [f.province, f.city, f.district].filter(Boolean).join(" ") || f.location],
    ["诚信年限", f.years ? `${Number(f.years)} 年` : null],
    ["员工规模", f.employeeCount ? `${f.employeeCount} 人` : null],
    ["厂房面积", f.areaSqm ? `${f.areaSqm} ㎡` : null],
    ["询盘回复率", f.replyRate ? `${Number(f.replyRate)}%` : null],
    ["老客户回头率", f.repurchaseRate ? `${Number(f.repurchaseRate)}%` : null],
    ["近月付款买家", f.monthlyBuyers ? `${f.monthlyBuyers}` : null],
    ["合作模式", f.oemMode],
    ["加工类型", f.productionType],
    ["服务能力", f.serviceCapability],
    ["认证", f.cert],
  ];

  return (
    <div className="space-y-6">
      <Link to="/factories" className="text-sm text-[var(--sb-brand)] hover:underline">
        ← 返回工厂库
      </Link>

      <div className="rounded-xl border border-black/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{f.name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {f.tier && <span className="rounded bg-[var(--sb-brand-soft)] px-2 py-0.5 font-medium text-[var(--sb-brand)]">{f.tier}</span>}
              {f.isSuper && <span className="rounded bg-[var(--sb-brand-soft)] px-2 py-0.5 text-[var(--sb-brand)]">超级工厂</span>}
              {f.medal && f.medal !== "无牌工厂" && (
                <span className="rounded bg-black/[0.05] px-2 py-0.5 text-black/60">{f.medal}{f.medalLevel ?? ""}</span>
              )}
              {[...new Set<string>((f.tags ?? []).filter((t: string) => t !== f.tier && !(f.isSuper && t === "超级工厂")))].map((t) => (
                <span key={t} className="rounded bg-black/[0.05] px-2 py-0.5 text-black/60">{t}</span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="sb-num text-3xl font-bold text-[var(--sb-brand)]">{f.score}</div>
            <div className="text-xs text-black/45">严选评分</div>
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
            用这家工厂算到手价 →
          </Link>
        </div>
      </div>

      {/* 实拍图集：产品/车间/设备/仓库/大门/产品册 */}
      {f.images &&
        (["product", "workshop", "equipment", "warehouse", "gate", "catalog"] as const).some(
          (k) => (f.images as Record<string, string[]>)[k]?.length
        ) && (
          <div className="rounded-xl border border-black/10 bg-white p-6">
            <h2 className="mb-4 font-semibold">工厂实拍</h2>
            <div className="space-y-4">
              {IMAGE_GROUPS.map(([k, label]) => {
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
                          aria-label={`放大查看${label}`}
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
            <p className="mt-3 text-[11px] text-black/35">点击图片可放大查看，左右方向键切换，Esc 关闭。</p>
          </div>
        )}

      {f.scores && (
        <div className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="mb-1 font-semibold">评分明细</h2>
          <p className="mb-4 text-xs leading-relaxed text-black/45">
            综合评分 = 七维加权 + 基础分。权重公开、工厂不可付费调分：
            质量认证 15% · 工厂实力 15% · 诚信年限 12% · 复购率 12% · 生产产能 10% · 服务响应 10% · 销售表现 13%。
          </p>
          <div className="space-y-3">
            {SCORE_LABELS.map(([key, label]) => {
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
                        title={`同类目中位数 ${med.toFixed(1)}`}
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
                      title={`同类目中位数 ${med!.toFixed(1)}`}
                    >
                      {Math.abs(delta) < 0.05
                        ? "持平"
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
              竖线 = 「{(f as any).category}」类目工厂中位数，右侧数字为该厂与中位数的差值；刻度按类目内有该维度评分数据的工厂计算，样本不足的维度不显示
            </p>
          )}
          <details className="mt-4 text-xs text-black/45">
            <summary className="cursor-pointer select-none font-medium text-[var(--sb-brand)] hover:underline">
              每个维度看什么？
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
              {SCORING_FORMULA.dimensions.map((d) => (
                <li key={d.key}>
                  <span className="font-medium text-black/70">{d.label}</span>（{Math.round(d.weight * 100)}%）：{d.desc}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              算法已对 {SCORING_FORMULA.verifiedOn} 家有完整子分的工厂回归验证，拟合误差 ≤{SCORING_FORMULA.maxError} 分。
            </p>
          </details>
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
            aria-label="关闭"
          >
            ×
          </button>
          {flatImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewer((viewer - 1 + flatImages.length) % flatImages.length); }}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition-colors hover:bg-white/20"
                aria-label="上一张"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewer((viewer + 1) % flatImages.length); }}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition-colors hover:bg-white/20"
                aria-label="下一张"
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
