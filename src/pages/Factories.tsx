import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";

const TIERS = ["金标", "银标", "铜标", "优选", "培育"];
const CERTS = [
  { v: "sgs", l: "SGS" },
  { v: "intertek", l: "Intertek" },
  { v: "tuv", l: "TÜV" },
  { v: "cti", l: "CTI" },
];

export default function Factories() {
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
        <h1 className="sb-display mt-4 text-3xl tracking-tight sm:text-[40px]">严选工厂库</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-black/55">
          每一家都验过资质、产能、履约记录。评分公式公开，工厂花钱买不到名次。
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
          placeholder="搜索工厂名称…"
          className={sel + " min-w-48"}
        />
        <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }} className={sel}>
          <option value="">全部分层</option>
          {TIERS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={cert} onChange={(e) => { setCert(e.target.value); setPage(1); }} className={sel}>
          <option value="">全部认证</option>
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
          placeholder="地区，如 深圳"
          className={sel + " w-32"}
        />
      </div>

      <p className="text-xs text-black/45">
        {q.isLoading ? "加载中…" : `共 ${q.data?.total ?? 0} 家，按严选评分从高到低`}
      </p>

      {!q.isLoading && q.data?.total === 0 && (
        <div className="rounded-xl border border-dashed border-black/15 bg-white p-8 text-center">
          <p className="font-medium">没有直接匹配的工厂</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-black/55">
            试试更宽泛的词（如"服饰"代替"卫衣"），或清空筛选条件。
            找不到的品可以交给 AI 买手人工补源——工厂库每周都在扩充。
          </p>
          <button
            onClick={() => { setKeyword(""); setTier(""); setCert(""); setLocation(""); setPage(1); }}
            className="sb-pill mt-5 border border-black/15 px-5 py-2 text-sm hover:bg-black/[0.03]"
          >
            清空筛选，查看全部
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
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {f.tier && (
                <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-black/60">{f.tier}</span>
              )}
              {f.isSuper && (
                <span className="rounded bg-[var(--sb-brand-soft)] px-1.5 py-0.5 text-[var(--sb-brand)]">超级工厂</span>
              )}
              {f.medal && f.medal !== "无牌工厂" && (
                <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-black/60">
                  {f.medal}
                  {f.medalLevel ?? ""}
                </span>
              )}
            </div>
            <p className="sb-num mt-2.5 text-xs text-black/45">
              {[f.location, f.years ? `${Number(f.years)} 年` : null, f.repurchaseRate ? `复购 ${Number(f.repurchaseRate)}%` : null]
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
            上一页
          </button>
          <span className="sb-num text-sm text-black/45">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="sb-pill border border-black/15 px-5 py-2 text-sm hover:bg-black/[0.03] disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
