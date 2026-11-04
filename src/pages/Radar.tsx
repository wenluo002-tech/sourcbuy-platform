import { Link } from "react-router";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useReveal } from "@/hooks/useReveal";

type RadarItem = {
  id: number;
  title: string;
  titleEn: string | null;
  signalSource: "amazon" | "tiktok";
  signalText: string;
  signalUrl: string | null;
  signalDate: string;
  retailPriceUsd: number | null;
  factoryPriceMin: number | null;
  factoryPriceMax: number | null;
  upstreamCount: number | null;
  vettedCount: number | null;
  topSales: number | null;
  note: string | null;
};

const SOURCE_META = {
  amazon: { label: "亚马逊", cls: "bg-[#fff4e5] text-[#b45309] border-[#f5d9b8]" },
  tiktok: { label: "TikTok", cls: "bg-[#f3efff] text-[#6d28d9] border-[#ddd0f7]" },
} as const;

function fmtSales(n: number | null): string | null {
  if (n == null || n <= 0) return null;
  if (n >= 100000) return "10万+";
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万+`;
  return `${n}`;
}

export function RadarCard({ it, i }: { it: RadarItem; i: number }) {
  const src = SOURCE_META[it.signalSource];
  const sales = fmtSales(it.topSales);
  return (
    <div
      className="sb-reveal flex flex-col rounded-xl border border-[var(--sb-line)] bg-white p-4 transition-all duration-300 hover:border-[var(--sb-brand)]/40 hover:shadow-[0_8px_24px_-12px_rgba(31,74,148,0.18)]"
      style={{ ["--sb-delay" as string]: `${Math.min(i, 8) * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug text-[var(--sb-ink)]">{it.title}</h3>
          {it.titleEn && <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--sb-ink-40)]">{it.titleEn}</p>}
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${src.cls}`}>
          {src.label}
        </span>
      </div>

      {/* 海外信号：真实出处 + 日期，可点击验证 */}
      <p className="mt-2.5 text-xs leading-relaxed text-[var(--sb-ink-60)]">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--sb-brand)] align-middle" />
        {it.signalUrl ? (
          <a href={it.signalUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--sb-brand)]">
            {it.signalText}
          </a>
        ) : (
          it.signalText
        )}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-dashed border-[var(--sb-line)] pt-3 text-[11px]">
        {it.factoryPriceMin != null && it.factoryPriceMax != null ? (
          <div>
            <span className="text-[var(--sb-ink-40)]">源头出厂价带</span>
            <div className="sb-num mt-0.5 text-[13px] font-semibold text-[var(--sb-ink)]">
              ¥{it.factoryPriceMin}–{it.factoryPriceMax}
            </div>
          </div>
        ) : (
          <div>
            <span className="text-[var(--sb-ink-40)]">源头出厂价</span>
            <div className="mt-0.5 text-[13px] font-semibold text-[var(--sb-ink)]">询我查实价</div>
          </div>
        )}
        <div>
          <span className="text-[var(--sb-ink-40)]">{it.retailPriceUsd != null ? "海外零售参考" : "严选库相关工厂"}</span>
          <div className="sb-num mt-0.5 text-[13px] font-semibold text-[var(--sb-ink)]">
            {it.retailPriceUsd != null ? `$${it.retailPriceUsd}` : `${it.vettedCount ?? 0} 家`}
          </div>
        </div>
      </div>

      {it.note && (
        <p className="mt-3 rounded-lg bg-[var(--sb-paper)] px-3 py-2 text-[11px] leading-relaxed text-[var(--sb-ink-60)]">
          <span className="font-semibold text-[var(--sb-brand)]">老采购：</span>
          {it.note}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 pt-1">
        <span className="text-[10px] text-[var(--sb-ink-40)]">
          信号 {it.signalDate}
          {sales ? ` · 头部在售 ${sales}` : ""}
        </span>
        <Link
          to={`/buyer?prefill=${encodeURIComponent(`我在爆款雷达上看到「${it.title}」，帮我查对口工厂和到手价`)}`}
          className="sb-pill shrink-0 rounded-full bg-[var(--sb-brand)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--sb-brand-hover)]"
        >
          问老采购这款
        </Link>
      </div>
    </div>
  );
}

export default function Radar() {
  const q = trpc.radar.list.useQuery(undefined, { staleTime: 60_000 });
  const [filter, setFilter] = useState<"all" | "amazon" | "tiktok">("all");
  const pageRef = useReveal<HTMLDivElement>();

  const items = (q.data?.items ?? []) as RadarItem[];
  const shown = filter === "all" ? items : items.filter((x) => x.signalSource === filter);

  return (
    <div ref={pageRef} className="space-y-8">
      <header className="sb-reveal">
        <span className="sb-eyebrow flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--sb-brand)]" />
          Hot Signals · 海外爆款雷达
        </span>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">海外在爆什么，工厂能不能造</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sb-ink-60)]">
          每个品都钉着三件事：真实可验证的海外热度信号（亚马逊官方榜单 / TikTok 行业公开报道，带来源与日期）、
          国内源头出厂价带（实时查询）、严选工厂库对口产能。榜单是需求信号不是保票——先小单试水，再放大。
        </p>
      </header>

      <div className="sb-reveal flex items-center gap-2">
        {([
          ["all", "全部"],
          ["amazon", "亚马逊信号"],
          ["tiktok", "TikTok 信号"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
              filter === k
                ? "border-[var(--sb-brand)] bg-[var(--sb-brand-soft)] text-[var(--sb-brand)]"
                : "border-[var(--sb-line)] bg-white text-[var(--sb-ink-60)] hover:border-[var(--sb-brand)]/40"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto whitespace-nowrap text-xs text-[var(--sb-ink-40)]">
          {q.isLoading ? "加载中…" : `本期 ${shown.length} 个品 · 每周更新`}
        </span>
      </div>

      {q.isError ? (
        <p className="sb-reveal rounded-xl border border-[var(--sb-line)] bg-white p-6 text-sm text-[var(--sb-ink-60)]">
          榜单数据加载失败，请刷新重试——数据没回来我们不会拿旧数据糊弄你。
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((it, i) => (
            <RadarCard key={it.id} it={it} i={i} />
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--sb-ink-40)]">
        口径说明：亚马逊信号来自美国站官方 Best Sellers 榜单实抓（排名为 BSR 口径，非绝对销量）；TikTok 信号来自 FastMoss/Kalodata 等第三方监测的公开报道，已标注统计截止日。
        出厂价带为国内源头货源实时查询价格区间，未含国际运费与关税——到手价请用「到手价试算」或直接问老采购。
      </p>
    </div>
  );
}
