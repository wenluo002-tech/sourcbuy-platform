import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { CountUp, useReveal } from "@/hooks/useReveal";

const TIER_ORDER = ["金标", "银标", "铜标", "优选", "培育"];

const TIER_DESC: Record<string, string> = {
  金标: "金字塔尖，大单放心托付",
  银标: "主力供货梯队，稳定可靠",
  铜标: "表现扎实，性价比之选",
  优选: "成长型供应商，潜力可期",
  培育: "新晋入驻，考察期内",
};

const EXAMPLES = [
  "瑜伽裤 500 条，发德国汉堡",
  "定制保温杯 3,000 个，要 LOGO",
  "LED 灯带，CE 认证，预算 $20,000",
  "折叠宠物推车 800 台，发美国",
];

export default function Home() {
  const stats = trpc.factories.stats.useQuery(undefined, { staleTime: 60_000 });
  const featured = trpc.factories.match.useQuery({ minScore: 90, limit: 6 });
  const [kw, setKw] = useState("");
  const navigate = useNavigate();
  const pageRef = useReveal<HTMLDivElement>();

  const goChat = (text: string) => {
    const q = text.trim();
    navigate(q ? `/buyer?prefill=${encodeURIComponent(q)}` : "/buyer");
  };

  const tierCount = (t: string) =>
    stats.data?.byTier.find((x) => x.tier === t)?.c ?? 0;

  return (
    <div ref={pageRef} className="space-y-14 md:space-y-20">
      {/* ===== Hero：老站同款科技背景图 + 左侧文字区浅底蒙版 ===== */}
      <section
        className="relative overflow-hidden rounded-[24px] px-5 py-11 sm:px-6 sm:py-14 md:px-16 md:py-24"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(238,246,252,0.94) 0%, rgba(238,246,252,0.72) 42%, rgba(238,246,252,0.08) 72%), url('/hero-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* 工程刻度十字：blueprint 仪式感 */}
        <span className="sb-tick left-4 top-4" />
        <span className="sb-tick right-4 top-4" />
        <span className="sb-tick bottom-4 left-4" />
        <span className="sb-tick bottom-4 right-4" />

        <div className="relative">
          <span className="sb-eyebrow flex items-center gap-2">
            <span className="sb-dot-live inline-block h-1.5 w-1.5 rounded-full bg-[var(--sb-brand)]" />
            AI Sourcing Agent · 只代表买方
          </span>

          <h1 className="mt-5 max-w-3xl text-[clamp(23px,6.8vw,30px)] font-bold leading-[1.12] tracking-tight sm:text-[44px] md:text-[60px]">
            <span className="sb-line-mask"><span className="whitespace-nowrap">说出采购需求，</span></span>
            <span className="sb-line-mask"><span className="whitespace-nowrap" style={{ ["--sb-delay" as string]: "100ms" }}>好货与底价一次给齐。</span></span>
          </h1>

          {/* 信任信号：三个短词，阶梯入场 */}
          <div className="mt-6 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[12px] text-[var(--sb-ink-60)] sm:gap-x-5 sm:text-[13px]">
            {["数千家严选工厂", "评分公开可核验", "全程只站你这边"].map((t, i) => (
              <span
                key={t}
                className="sb-line-mask flex items-center gap-2"
                style={{ ["--sb-delay" as string]: `${220 + i * 100}ms` }}
              >
                <span className="flex items-center gap-1.5 sm:gap-2">
                  <span className="h-1 w-1 rounded-[2px] bg-[var(--sb-brand)] sm:h-1.5 sm:w-1.5" />
                  {t}
                </span>
              </span>
            ))}
          </div>

          <form
            className="mt-8 max-w-2xl sm:mt-10"
            onSubmit={(e) => {
              e.preventDefault();
              goChat(kw);
            }}
          >
            <div
              className="sb-line-mask rounded-full"
              style={{ ["--sb-delay" as string]: "480ms" }}
            >
              <div className="flex items-center gap-2 rounded-full border border-[var(--sb-line)] bg-white/95 p-2 shadow-[0_1px_2px_rgba(11,11,11,0.05),0_12px_32px_-16px_rgba(31,74,148,0.25)] backdrop-blur-sm">
                <input
                  value={kw}
                  onChange={(e) => setKw(e.target.value)}
                  placeholder="例如：LED 灯带 500 卷，暖白，欧规插头，发德国…"
                  className="h-12 min-w-0 flex-1 bg-transparent px-4 text-[15px] placeholder:text-[var(--sb-ink-40)] focus-visible:outline-none"
                />
                <button
                  type="submit"
                  className="sb-pill flex h-12 shrink-0 items-center gap-2 bg-[var(--sb-brand)] px-6 text-sm font-semibold text-white hover:bg-[var(--sb-brand-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sb-brand)]"
                >
                  开始采购
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2 8h11M9 3.5 14 8l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </form>

          <div
            className="sb-line-mask mt-4"
            style={{ ["--sb-delay" as string]: "580ms" }}
          >
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((s) => (
                <button
                  key={s}
                  onClick={() => goChat(s)}
                  className="rounded-full border border-[var(--sb-line)] bg-white/70 px-3.5 py-1.5 text-xs text-[var(--sb-ink-60)] transition-colors duration-150 hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
                >
                  {s} →
                </button>
              ))}
            </div>
          </div>

          <p
            className="sb-line-mask mt-9"
            style={{ ["--sb-delay" as string]: "680ms" }}
          >
            <span className="text-[11px] text-[var(--sb-ink-60)] sm:text-xs">
              只代表买方 · 不收卖方返点 · 佣金费率公开 · 货损先行赔付
            </span>
          </p>
        </div>
      </section>

      {/* ===== 实时数字：滚动揭示 + 数字滚动；接口彻底失败时整块隐藏，不摆一排"…"装死 ===== */}
      {!stats.isError && (
      <section>
        <div className="sb-reveal flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
            Live from our database
          </h2>
          <span className="whitespace-nowrap text-xs text-[var(--sb-ink-40)]">实时统计自工厂数据库</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-y-7 border-t border-[var(--sb-line)] pt-6 sm:grid-cols-3 sm:gap-y-10 sm:pt-7 lg:grid-cols-6">
          <div className="sb-reveal">
            <div className="text-[30px] font-bold leading-none tracking-tight sm:text-[34px]">
              {stats.data ? <CountUp value={stats.data.total} /> : "…"}
            </div>
            <div className="mt-2 text-xs font-medium text-[var(--sb-ink)]">严选源头工厂</div>
            <div className="mt-1 text-[11px] leading-snug text-[var(--sb-ink-40)]">
              资质 · 产能 · 履约三重筛查
            </div>
          </div>
          {TIER_ORDER.map((t, i) => (
            <div key={t} className="sb-reveal" style={{ ["--sb-delay" as string]: `${(i + 1) * 90}ms` }}>
              <div className="text-[30px] font-bold leading-none tracking-tight sm:text-[34px]">
                {stats.data ? <CountUp value={tierCount(t)} /> : "…"}
              </div>
              <div className="mt-2 text-xs font-medium text-[var(--sb-ink)]">{t}工厂</div>
              <div className="mt-1 text-[11px] leading-snug text-[var(--sb-ink-40)]">
                {TIER_DESC[t]}
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* ===== 服务方式（叙事三步） ===== */}
      <section>
        <h2 className="sb-reveal text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
          How it works · 服务如何进行
        </h2>
        <div className="mt-4 border-t border-[var(--sb-line)]">
          {[
            ["说清楚需求", "产品、数量、目的地，用大白话说就行。需求不靠谱我会直说，不浪费你的时间。"],
            ["筛厂给证据", "从数千家严选工厂里锁定 3-6 家，每家给出评分、类目排名和推荐理由——评分公式公开，工厂买不通。"],
            ["算清到手价再下单", "出厂价、运费、关税、服务费逐行列明。佣金按类目 3.5%–11% 分档，最低 $50，没有隐藏差价。"],
          ].map(([title, desc], i) => (
            <div
              key={title}
              className="sb-reveal group grid gap-1.5 border-b border-[var(--sb-line)] py-5 transition-colors duration-300 hover:bg-white/50 md:grid-cols-[120px_200px_1fr] md:gap-6 md:py-7"
              style={{ ["--sb-delay" as string]: `${i * 90}ms` }}
            >
              <div className="flex items-baseline gap-3 md:contents">
                <span className="sb-num text-xs font-semibold uppercase tracking-[0.16em] text-[var(--sb-ink-40)] transition-colors duration-300 group-hover:text-[var(--sb-brand)]">
                  Step {i + 1}
                </span>
                <h3 className="font-semibold">{title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-[var(--sb-ink-60)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 三不承诺 ===== */}
      <section>
        <h2 className="sb-reveal text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
          Our promise · 三条铁律
        </h2>
        <div className="mt-4 border-t border-[var(--sb-line)]">
          {[
            ["不收工厂返点", "唯一收入是向买家收取的履约佣金。工厂无法付费影响推荐排序——算法公开，接受对账。"],
            ["不加隐藏差价", "工厂原始报价含阶梯价完整展示，谈下来的折扣 100% 归你。"],
            ["损失先行赔付", "货不对板、损毁、丢失、海关扣件，平台先赔再追偿，不用你自己找工厂扯皮。"],
          ].map(([title, desc], i) => (
            <div
              key={title}
              className="sb-reveal grid gap-1.5 border-b border-[var(--sb-line)] py-5 transition-colors duration-300 hover:bg-white/50 md:grid-cols-[120px_200px_1fr] md:gap-6 md:py-7"
              style={{ ["--sb-delay" as string]: `${i * 90}ms` }}
            >
              <div className="flex items-baseline gap-3 md:contents">
                <span className="sb-num text-xs font-semibold uppercase tracking-[0.16em] text-[var(--sb-ink-40)]">
                  0{i + 1}
                </span>
                <h3 className="font-semibold">{title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-[var(--sb-ink-60)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 头部工厂 ===== */}
      <section>
        <div className="sb-reveal flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
            Top rated · 头部严选工厂
          </h2>
          <Link
            to="/factories"
            className="text-sm font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline"
          >
            查看全部 →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(featured.data ?? []).map((f, i) => (
            <Link
              key={f.id}
              to={`/factories/${f.id}`}
              className="sb-reveal group rounded-xl border border-[var(--sb-line)] bg-white p-4 transition-all duration-300 hover:border-[var(--sb-brand)]/40 hover:shadow-[0_8px_24px_-12px_rgba(31,74,148,0.18)]"
              style={{ ["--sb-delay" as string]: `${i * 70}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 text-sm font-semibold text-[var(--sb-ink)] [@media(hover:hover)]:group-hover:text-[var(--sb-brand)]">
                  {f.name}
                </h3>
                <span className="sb-num shrink-0 rounded bg-[var(--sb-brand-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--sb-brand)]">
                  {f.tier} {f.score}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--sb-ink-60)]">
                {f.reason}
              </p>
              <p className="sb-num mt-2 text-xs text-[var(--sb-ink-40)]">
                {f.location}
                {f.years ? ` · ${f.years} 年` : ""}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
