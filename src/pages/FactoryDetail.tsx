import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { SCORING_FORMULA } from "@contracts/scoring";

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

  if (q.isLoading) return <p className="text-stone-500">加载中…</p>;
  if (!q.data) return <p className="text-stone-500">工厂不存在。</p>;
  const f = q.data;

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

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{f.name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {f.tier && <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800">{f.tier}</span>}
              {f.isSuper && <span className="rounded bg-[var(--sb-brand-soft)] px-2 py-0.5 text-[var(--sb-brand)]">超级工厂</span>}
              {f.medal && f.medal !== "无牌工厂" && (
                <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-600">{f.medal}{f.medalLevel ?? ""}</span>
              )}
              {(f.tags ?? []).map((t) => (
                <span key={t} className="rounded bg-stone-100 px-2 py-0.5 text-stone-600">{t}</span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-[var(--sb-brand)]">{f.score}</div>
            <div className="text-xs text-stone-500">严选评分</div>
          </div>
        </div>

        {f.review && (
          <p className="mt-4 rounded-lg bg-stone-50 p-4 text-sm leading-relaxed text-stone-700">
            {f.review}
          </p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-stone-400">{k}</dt>
                <dd className="mt-0.5 text-stone-800">{v}</dd>
              </div>
            ))}
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/calculator"
            className="rounded-lg bg-[var(--sb-brand)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--sb-brand-hover)]"
          >
            用这家工厂算到手价 →
          </Link>
          {f.home && (
            <a
              href={f.home}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
            >
              查看 1688 店铺 ↗
            </a>
          )}
        </div>
      </div>

      {/* 实拍图集：产品/车间/设备/仓库/大门/产品册 */}
      {f.images &&
        (["product", "workshop", "equipment", "warehouse", "gate", "catalog"] as const).some(
          (k) => (f.images as Record<string, string[]>)[k]?.length
        ) && (
          <div className="rounded-xl border border-stone-200 bg-white p-6">
            <h2 className="mb-4 font-semibold">工厂实拍</h2>
            <div className="space-y-4">
              {(
                [
                  ["product", "产品实拍"],
                  ["workshop", "生产车间"],
                  ["equipment", "生产设备"],
                  ["warehouse", "仓储"],
                  ["gate", "厂区"],
                  ["catalog", "产品册"],
                ] as const
              ).map(([k, label]) => {
                const list = ((f.images as Record<string, string[]>)?.[k] ?? [])
                  .filter((u) => /^https?:\/\//i.test(u))
                  .slice(0, 6);
                if (!list.length) return null;
                return (
                  <div key={k}>
                    <p className="mb-1.5 text-xs font-medium text-stone-500">{label}</p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt={label}
                          loading="lazy"
                          className="h-24 w-24 rounded-lg border border-stone-100 object-cover md:h-28 md:w-28"
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {f.scores && (
        <div className="rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="mb-1 font-semibold">评分明细</h2>
          <p className="mb-4 text-xs leading-relaxed text-stone-500">
            综合评分 = 七维加权 + 基础分。权重公开、工厂不可付费调分：
            质量认证 15% · 工厂实力 15% · 诚信年限 12% · 复购率 12% · 生产产能 10% · 服务响应 10% · 销售表现 13%。
          </p>
          <div className="space-y-3">
            {SCORE_LABELS.map(([key, label]) => {
              const v = (f.scores as any)[key];
              const n = v != null ? Number(v) : null;
              if (n == null) return null;
              const dim = SCORING_FORMULA.dimensions.find((d) => d.key === key);
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-stone-500" title={dim?.desc}>
                    {label}
                    {dim && (
                      <span className="ml-1 text-[10px] text-stone-400">
                        {Math.round(dim.weight * 100)}%
                      </span>
                    )}
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-stone-100">
                    <div
                      className="h-2 rounded-full bg-[var(--sb-brand)]"
                      style={{ width: `${Math.min(100, n)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs font-medium">{n}</span>
                </div>
              );
            })}
          </div>
          <details className="mt-4 text-xs text-stone-500">
            <summary className="cursor-pointer select-none font-medium text-[var(--sb-brand)] hover:underline">
              每个维度看什么？
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
              {SCORING_FORMULA.dimensions.map((d) => (
                <li key={d.key}>
                  <span className="font-medium text-stone-700">{d.label}</span>（{Math.round(d.weight * 100)}%）：{d.desc}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              算法已对 {SCORING_FORMULA.verifiedOn} 家有完整子分的工厂回归验证，拟合误差 ≤{SCORING_FORMULA.maxError} 分。
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
