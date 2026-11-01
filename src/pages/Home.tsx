import { Link } from "react-router";
import { trpc } from "@/providers/trpc";

const TIER_ORDER = ["金标", "银标", "铜标", "优选", "培育"];

export default function Home() {
  const stats = trpc.factories.stats.useQuery();
  const featured = trpc.factories.match.useQuery({ minScore: 90, limit: 6 });

  const tierCount = (t: string) =>
    stats.data?.byTier.find((x) => x.tier === t)?.c ?? 0;

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="rounded-2xl bg-emerald-950 px-6 py-14 text-white md:px-12">
        <p className="mb-3 text-sm font-medium text-emerald-300">
          AI 驱动的采购代理 · 只代表买家
        </p>
        <h1 className="max-w-2xl text-3xl font-bold leading-tight md:text-4xl">
          说出你要的品，
          <br />
          我给你 3-6 家靠谱工厂。
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-emerald-100/90 md:text-base">
          不是工厂黄页，是一个替你算清账、替你承担风险的采购代理。
          货不对板、运输损毁、海关扣件——平台先赔，再追偿。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/factories"
            className="rounded-lg bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            进入严选工厂库
          </Link>
          <Link
            to="/calculator"
            className="rounded-lg border border-emerald-400/40 px-5 py-2.5 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            算一笔到手价
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap gap-8 text-sm">
          <div>
            <div className="text-2xl font-bold">{stats.data?.total ?? "…"}</div>
            <div className="text-emerald-200/80">严选源头工厂</div>
          </div>
          {TIER_ORDER.map((t) => (
            <div key={t}>
              <div className="text-2xl font-bold">{tierCount(t)}</div>
              <div className="text-emerald-200/80">{t}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 三不承诺 */}
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["不收工厂返点", "我们的唯一收入是向买家收取的履约佣金，工厂无法付费影响推荐排序。"],
          ["不加隐藏差价", "工厂原始报价单（含阶梯价）向你完整展示，谈下来的折扣 100% 归你。"],
          ["先行赔付", "货不对板、损毁、丢失、扣件，平台先赔再追偿，无需你自己找工厂追责。"],
        ].map(([title, desc]) => (
          <div key={title} className="rounded-xl border border-stone-200 bg-white p-5">
            <h3 className="font-semibold text-emerald-900">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{desc}</p>
          </div>
        ))}
      </section>

      {/* 头部工厂 */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">头部严选工厂</h2>
          <Link to="/factories" className="text-sm text-emerald-700 hover:underline">
            查看全部 →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(featured.data ?? []).map((f) => (
            <Link
              key={f.id}
              to={`/factories/${f.id}`}
              className="group rounded-xl border border-stone-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 font-semibold group-hover:text-emerald-800">
                  {f.name}
                </h3>
                <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {f.tier} {f.score}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-stone-500">{f.reason}</p>
              <p className="mt-2 text-xs text-stone-400">
                {f.location} {f.years ? `· ${f.years} 年` : ""}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
