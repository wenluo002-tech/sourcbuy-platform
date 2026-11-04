import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { CountUp, useReveal } from "@/hooks/useReveal";
import { RadarCard } from "@/pages/Radar";

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
  const radar = trpc.radar.list.useQuery(undefined, { staleTime: 60_000 });
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
      {/* ===== Hero：事务所版式——细线框架 + 右侧挺括图栏 + 衬线大标题 ===== */}
      <section className="sb-reveal relative border-y border-[var(--sb-rule)]">
        {/* 背景：太空科技图 100vw 满屏平铺（突破内容容器），左实右虚蒙版保文字可读 */}
        <div
          className="absolute inset-y-0 left-1/2 hidden w-screen -translate-x-1/2 md:block"
          style={{
            backgroundImage: "url('/hero-bg.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "right center",
          }}
        />
        {/* 桌面端蒙版：只保左侧文字区可读，右侧让图铺满透出 */}
        <div
          className="absolute inset-y-0 left-1/2 hidden w-screen -translate-x-1/2 md:block"
          style={{
            background:
              "linear-gradient(90deg, rgba(243,248,252,0.97) 0%, rgba(243,248,252,0.92) 28%, rgba(243,248,252,0.62) 48%, rgba(243,248,252,0.18) 68%, rgba(243,248,252,0.02) 100%)",
          }}
        />
        {/* 移动端：图同样 100vw 满屏平铺，均匀浅蒙版保整区可读 */}
        <div
          className="absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 md:hidden"
          style={{
            backgroundImage: "url('/hero-bg.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          className="absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 md:hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(243,248,252,0.95) 0%, rgba(243,248,252,0.88) 42%, rgba(243,248,252,0.68) 72%, rgba(243,248,252,0.45) 100%)",
          }}
        />
        {/* 文字与行动区 */}
        <div className="relative px-1 py-10 sm:py-14 md:py-20 lg:max-w-[62%]">
          <span className="sb-eyebrow flex items-center gap-2">
            <span className="sb-dot-live inline-block h-1.5 w-1.5 rounded-full bg-[var(--sb-brand)]" />
            SourcBuy · AI 采购代理事务所
          </span>

            <h1 className="sb-display mt-6 text-[clamp(30px,7vw,44px)] leading-[1.14] tracking-tight md:text-[64px] md:leading-[1.08]">
              <span className="sb-line-mask"><span className="whitespace-nowrap">说出采购需求，</span></span>
              <span className="sb-line-mask"><span className="whitespace-nowrap" style={{ ["--sb-delay" as string]: "100ms" }}>好货与<span className="text-[var(--sb-brand)]">底价</span>一次给齐<span className="text-[var(--sb-brand)]">。</span></span></span>
            </h1>

            {/* 信任信号：主线一句 + 三条优势（对勾精致版） */}
            <div className="mt-7 flex items-center gap-3.5">
              <span className="h-px w-10 shrink-0 bg-[var(--sb-brand)]" />
              <span className="text-[14px] font-medium tracking-[0.08em] text-[var(--sb-ink)] sm:text-[15px]">
                AI 严选直连源头工厂
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2">
              {["数千家严选工厂", "评分公开可核验", "全程只站你这边"].map((t) => (
                <span key={t} className="flex items-center gap-2 text-[13px] text-[var(--sb-ink-60)]">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-[var(--sb-brand)]">
                    <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5 8.2 7.2 10.4 11 5.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t}
                </span>
              ))}
            </div>

            <form
              className="mt-9 max-w-2xl"
              onSubmit={(e) => {
                e.preventDefault();
                goChat(kw);
              }}
            >
              <div className="flex items-stretch border border-[var(--sb-rule)] bg-white">
                <input
                  value={kw}
                  onChange={(e) => setKw(e.target.value)}
                  placeholder="例如：LED 灯带 500 卷，暖白，欧规插头，发德国…"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[15px] placeholder:text-[var(--sb-ink-40)] focus-visible:outline-none"
                />
                <button
                  type="submit"
                  className="flex shrink-0 items-center gap-2 bg-[var(--sb-brand)] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[var(--sb-brand-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sb-brand)] sm:px-7"
                >
                  开始采购
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2 8h11M9 3.5 14 8l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </form>

            <div className="mt-6 flex flex-wrap items-baseline gap-x-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--sb-ink-40)]">
                试试这样问
              </p>
              <p className="text-[11px] text-[var(--sb-ink-40)]">
                也可以直接贴亚马逊 / TikTok / 独立站商品链接，我帮你找同款货源
              </p>
            </div>
            <div className="mt-1 grid max-w-2xl grid-cols-1 sm:grid-cols-2 sm:gap-x-8">
              {EXAMPLES.map((s, i) => (
                <button
                  key={s}
                  onClick={() => goChat(s)}
                  className="group flex items-baseline gap-2.5 border-b border-[var(--sb-line)] py-2.5 text-left transition-colors duration-150"
                >
                  <span className="sb-index shrink-0 text-[10px] text-[var(--sb-ink-40)] transition-colors duration-150 group-hover:text-[var(--sb-brand)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] text-[var(--sb-ink-60)] transition-colors duration-150 group-hover:text-[var(--sb-brand)]">
                    {s}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--sb-ink-40)] opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--sb-brand)] group-hover:opacity-100">
                    →
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-10 border-t border-[var(--sb-line)] pt-4 text-[11px] text-[var(--sb-ink-60)] sm:text-xs">
              只代表买方 · 不收卖方返点 · 佣金费率公开 · 货损先行赔付
            </p>
          </div>

          <div className="absolute bottom-3 left-4 hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[rgba(21,37,49,0.75)] md:flex">
            <span className="sb-dot-live inline-block h-1.5 w-1.5 rounded-full bg-[var(--sb-brand)]" />
            China Supply Network · Live
          </div>
      </section>

      {/* ===== 海外爆款雷达：需求信号 → 产能 → 出厂价带，每周更新 ===== */}
      {/* 区域框架常驻：接口失败/加载中只换内容行，不让整个区块消失 */}
      <section>
        <div className="sb-reveal sb-rule flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
            Hot signals · 海外爆款雷达
          </h2>
          <Link
            to="/radar"
            className="text-sm font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline"
          >
            查看完整榜单 →
          </Link>
        </div>
        <p className="sb-reveal mt-2 text-xs text-[var(--sb-ink-40)]">
          海外在爆什么（真实榜单出处）→ 国内工厂能不能造（出厂价带 + 严选产能）——每周更新
        </p>
        {radar.isError ? (
          <p className="mt-6 border-t border-[var(--sb-line)] pt-5 text-sm text-[var(--sb-ink-60)]">
            榜单数据刚才没拉回来——刷新试试；数据没回来我们不拿旧数据糊弄你。
          </p>
        ) : (radar.data?.items?.length ?? 0) > 0 ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {radar.data!.items.slice(0, 6).map((it, i) => (
              <RadarCard key={it.id} it={it} i={i} />
            ))}
          </div>
        ) : (
          <p className="mt-6 border-t border-[var(--sb-line)] pt-5 text-sm text-[var(--sb-ink-40)]">
            榜单加载中…
          </p>
        )}
      </section>

      {/* ===== 实时数字：台账版式——衬线大数字 + 纵向细线分栏 ===== */}
      {!stats.isError && (
      <section>
        <div className="sb-reveal sb-rule flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
            Live from our database
          </h2>
          <span className="whitespace-nowrap text-xs text-[var(--sb-ink-40)]">实时统计自工厂数据库</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-y-7 border-t border-[var(--sb-line)] sm:grid-cols-3 lg:grid-cols-6">
          <div className="sb-reveal pt-6 sm:pt-7">
            <div className="sb-display text-[34px] leading-none tracking-tight sm:text-[40px]">
              {stats.data ? <CountUp value={stats.data.total} /> : "…"}
            </div>
            <div className="mt-2.5 text-xs font-medium text-[var(--sb-ink)]">严选源头工厂</div>
            <div className="mt-1 text-[11px] leading-snug text-[var(--sb-ink-40)]">
              资质 · 产能 · 履约三重筛查
            </div>
          </div>
          {TIER_ORDER.map((t, i) => (
            <div key={t} className="sb-reveal border-l border-[var(--sb-line)] pl-4 pt-6 sm:pl-5 sm:pt-7" style={{ ["--sb-delay" as string]: `${(i + 1) * 90}ms` }}>
              <div className="sb-display text-[34px] leading-none tracking-tight sm:text-[40px]">
                {stats.data ? <CountUp value={tierCount(t)} /> : "…"}
              </div>
              <div className="mt-2.5 text-xs font-medium text-[var(--sb-ink)]">{t}工厂</div>
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
        <h2 className="sb-reveal sb-rule pt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
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
              className="sb-reveal group grid gap-1.5 border-b border-[var(--sb-line)] py-5 transition-colors duration-300 hover:bg-white/60 md:grid-cols-[120px_200px_1fr] md:gap-6 md:py-7"
              style={{ ["--sb-delay" as string]: `${i * 90}ms` }}
            >
              <div className="flex items-baseline gap-3 md:contents">
                <span className="sb-index text-xs font-semibold uppercase text-[var(--sb-ink-40)] transition-colors duration-300 group-hover:text-[var(--sb-brand)]">
                  Step {i + 1}
                </span>
                <h3 className="sb-display text-[17px]">{title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-[var(--sb-ink-60)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 三不承诺 ===== */}
      <section>
        <h2 className="sb-reveal sb-rule pt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
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
              className="sb-reveal grid gap-1.5 border-b border-[var(--sb-line)] py-5 transition-colors duration-300 hover:bg-white/60 md:grid-cols-[120px_200px_1fr] md:gap-6 md:py-7"
              style={{ ["--sb-delay" as string]: `${i * 90}ms` }}
            >
              <div className="flex items-baseline gap-3 md:contents">
                <span className="sb-index text-xs font-semibold uppercase text-[var(--sb-ink-40)]">
                  0{i + 1}
                </span>
                <h3 className="sb-display text-[17px]">{title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-[var(--sb-ink-60)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 头部工厂：台账卡——细线顶规 + 衬线厂名 + 索引号 ===== */}
      <section>
        <div className="sb-reveal sb-rule flex items-baseline justify-between pt-3">
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
        <div className="mt-4 grid gap-x-6 gap-y-0 border-t border-[var(--sb-line)] sm:grid-cols-2 lg:grid-cols-3">
          {(featured.data ?? []).map((f, i) => (
            <Link
              key={f.id}
              to={`/factories/${f.id}`}
              className="sb-reveal group border-b border-[var(--sb-line)] py-4 transition-colors duration-200 hover:bg-white/60"
              style={{ ["--sb-delay" as string]: `${i * 70}ms` }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="sb-index text-[11px] text-[var(--sb-ink-40)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="sb-num shrink-0 text-xs font-semibold text-[var(--sb-brand)]">
                  {f.tier} {f.score}
                </span>
              </div>
              <h3 className="sb-display mt-1.5 line-clamp-1 text-[16px] leading-snug text-[var(--sb-ink)] [@media(hover:hover)]:group-hover:text-[var(--sb-brand)]">
                {f.name}
              </h3>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--sb-ink-60)]">
                {f.reason}
              </p>
              <p className="sb-num mt-2 text-[11px] text-[var(--sb-ink-40)]">
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
