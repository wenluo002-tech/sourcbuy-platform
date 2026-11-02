import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { trpc } from "@/providers/trpc";

const TIER_ORDER = ["金标", "银标", "铜标", "优选", "培育"];

const EXAMPLES = [
  "瑜伽裤 500 条，发德国汉堡",
  "定制保温杯 3,000 个，要 LOGO",
  "LED 灯带，CE 认证，预算 $20,000",
  "折叠宠物推车 800 台，发美国",
];

export default function Home() {
  const stats = trpc.factories.stats.useQuery();
  const featured = trpc.factories.match.useQuery({ minScore: 90, limit: 6 });
  const [kw, setKw] = useState("");
  const navigate = useNavigate();

  const goChat = (text: string) => {
    const q = text.trim();
    navigate(q ? `/buyer?prefill=${encodeURIComponent(q)}` : "/buyer");
  };

  const tierCount = (t: string) =>
    stats.data?.byTier.find((x) => x.tier === t)?.c ?? 0;

  return (
    <div className="space-y-16">
      {/* ===== Hero：对话即首屏 ===== */}
      <section className="sb-rise rounded-[20px] bg-[var(--sb-mist)] px-6 py-12 md:px-14 md:py-16">
        <span className="sb-eyebrow">AI Sourcing Agent · 只代表买方</span>
        <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-[1.15] tracking-tight md:text-[44px]">
          说出你要采购的，
          <br />
          剩下的交给我把关。
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--sb-ink-60)] md:text-base">
          不是工厂黄页。描述产品、数量和交付地，我像老采购一样替你筛厂——
          不靠谱的需求会直接顶回去，每一家的推荐理由都带证据，到手价当场算清。
        </p>

        <form
          className="mt-8 max-w-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            goChat(kw);
          }}
        >
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--sb-line)] bg-white p-2 shadow-[0_1px_2px_rgba(11,11,11,0.05)]">
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="例如：LED 灯带 500 卷，10 米/卷，暖白，欧规插头，发德国…"
              className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[15px] placeholder:text-[var(--sb-ink-40)] focus-visible:outline-none"
            />
            <button
              type="submit"
              className="h-11 shrink-0 rounded-xl bg-[var(--sb-brand)] px-5 text-sm font-semibold text-[#eef4f5] transition-colors hover:bg-[var(--sb-brand-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sb-brand)]"
            >
              开始采购
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((s) => (
            <button
              key={s}
              onClick={() => goChat(s)}
              className="rounded-full border border-[var(--sb-line)] bg-white/60 px-3.5 py-1.5 text-xs text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
            >
              {s} →
            </button>
          ))}
        </div>

        <p className="mt-8 text-xs text-[var(--sb-ink-60)]">
          只代表买方 · 不收卖方返点 · 佣金费率公开 · 货损先行赔付
        </p>
      </section>

      {/* ===== 实时数字 ===== */}
      <section className="sb-rise" style={{ ["--sb-delay" as string]: "80ms" }}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
            Live from our database
          </h2>
          <span className="text-xs text-[var(--sb-ink-40)]">实时统计自工厂数据库</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-y-8 border-t border-[var(--sb-line)] pt-6 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <div className="text-3xl font-bold tracking-tight">
              {stats.data ? stats.data.total.toLocaleString() : "…"}
            </div>
            <div className="mt-1 text-xs text-[var(--sb-ink-60)]">严选源头工厂</div>
          </div>
          {TIER_ORDER.map((t) => (
            <div key={t}>
              <div className="text-3xl font-bold tracking-tight">
                {stats.data ? tierCount(t).toLocaleString() : "…"}
              </div>
              <div className="mt-1 text-xs text-[var(--sb-ink-60)]">{t}工厂</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 服务方式（叙事三步） ===== */}
      <section className="sb-rise" style={{ ["--sb-delay" as string]: "120ms" }}>
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
          How it works · 服务如何进行
        </h2>
        <div className="mt-4 border-t border-[var(--sb-line)]">
          {[
            ["说清楚需求", "产品、数量、目的地，用大白话说就行。需求不靠谱我会直说，不浪费你的时间。"],
            ["筛厂给证据", "从 4,060 家严选工厂里挑 3-6 家，每家给出评分、类目排名和推荐理由——评分公式公开，工厂买不通。"],
            ["算清到手价再下单", "出厂价、运费、关税、服务费逐行列明。佣金按类目 3.5%–11% 分档，最低 $50，没有隐藏差价。"],
          ].map(([title, desc], i) => (
            <div
              key={title}
              className="grid gap-2 border-b border-[var(--sb-line)] py-6 md:grid-cols-[120px_200px_1fr] md:gap-6"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--sb-ink-40)]">
                Step {i + 1}
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-[var(--sb-ink-60)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 三不承诺 ===== */}
      <section className="sb-rise" style={{ ["--sb-delay" as string]: "160ms" }}>
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
          Our promise · 三条铁律
        </h2>
        <div className="mt-4 border-t border-[var(--sb-line)]">
          {[
            ["不收工厂返点", "唯一收入是向买家收取的履约佣金。工厂无法付费影响推荐排序——算法公开，接受对账。"],
            ["不加隐藏差价", "工厂原始报价含阶梯价完整展示，谈下来的折扣 100% 归你。"],
            ["损失先行赔付", "货不对板、损毁、丢失、海关扣件，平台先赔再追偿，不用你自己找工厂扯皮。"],
          ].map(([title, desc]) => (
            <div
              key={title}
              className="grid gap-2 border-b border-[var(--sb-line)] py-6 md:grid-cols-[120px_200px_1fr] md:gap-6"
            >
              <span />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-[var(--sb-ink-60)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 头部工厂 ===== */}
      <section className="sb-rise" style={{ ["--sb-delay" as string]: "200ms" }}>
        <div className="flex items-baseline justify-between">
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
          {(featured.data ?? []).map((f) => (
            <Link
              key={f.id}
              to={`/factories/${f.id}`}
              className="group rounded-xl border border-[var(--sb-line)] bg-white p-4 transition-all hover:border-[var(--sb-brand)]/40 hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 text-sm font-semibold group-hover:text-[var(--sb-brand)]">
                  {f.name}
                </h3>
                <span className="shrink-0 rounded bg-[var(--sb-brand-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--sb-brand)]">
                  {f.tier} {f.score}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--sb-ink-60)]">
                {f.reason}
              </p>
              <p className="mt-2 text-xs text-[var(--sb-ink-40)]">
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
