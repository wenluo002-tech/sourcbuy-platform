import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";

const TIERS = ["金标", "银标", "铜标", "优选", "培育"];
const CERTS = [
  { v: "sgs", l: "SGS" },
  { v: "intertek", l: "Intertek" },
  { v: "tuv", l: "TÜV" },
  { v: "cti", l: "CTI" },
];

export default function Factories() {
  const [keyword, setKeyword] = useState("");
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
  const sel =
    "rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-700";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">严选工厂库</h1>

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

      <p className="text-sm text-stone-500">
        {q.isLoading ? "加载中…" : `共 ${q.data?.total ?? 0} 家，按严选评分排序`}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data?.rows ?? []).map((f) => (
          <Link
            key={f.id}
            to={`/factories/${f.id}`}
            className="group flex flex-col rounded-xl border border-stone-200 bg-white p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-1 font-semibold group-hover:text-emerald-800">
                {f.name}
              </h3>
              <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {f.score}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              {f.tier && (
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">{f.tier}</span>
              )}
              {f.isSuper && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">超级工厂</span>
              )}
              {f.medal && f.medal !== "无牌工厂" && (
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">
                  {f.medal}
                  {f.medalLevel ?? ""}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-stone-500">
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
            className="rounded-md border border-stone-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-stone-100"
          >
            上一页
          </button>
          <span className="text-sm text-stone-500">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-stone-100"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
