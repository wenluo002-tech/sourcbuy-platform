import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { SCORING_FORMULA } from "@contracts/scoring";

interface MatchedFactory {
  id: number;
  name: string;
  tier: string | null;
  score: number | null;
  years: number | null;
  location: string | null;
  cert: string | null;
  repurchaseRate: number | null;
  reason: string;
  subScores: Record<string, number | null> | null;
  categoryRank: { category: string; rank: number; total: number } | null;
  evidence: string[];
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  factories?: MatchedFactory[];
}

const SUGGESTIONS = [
  "我想采购宠物降温垫，500 件，发美国",
  "找做连帽卫衣的工厂，预算到手价 $4 以内",
  "蓝牙耳机，先寄样品看看质量",
];

export default function BuyerChat() {
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      content:
        "你好，我是你的 AI 采购买手。说说你要什么品、大概多少量、发往哪里——我从 4,060 家严选工厂里给你挑 3-6 家靠谱的，到手价当场算给你看。",
    },
  ]);
  const [input, setInput] = useState("");
  const chat = trpc.ai.chat.useMutation();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, chat.isPending]);

  function send(text: string) {
    const msg = text.trim();
    if (!msg || chat.isPending) return;
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((ts) => [...ts, { role: "user", content: msg }]);
    setInput("");
    chat.mutate(
      { message: msg, history },
      {
        onSuccess: (res) =>
          setTurns((ts) => [
            ...ts,
            { role: "assistant", content: res.reply, factories: res.factories },
          ]),
        onError: () =>
          setTurns((ts) => [
            ...ts,
            {
              role: "assistant",
              content:
                "刚才网络抖了一下，没收到回复。你再说一次？如果反复失败，也可以直接用工厂库搜索。",
            },
          ]),
      }
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] max-w-3xl flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto rounded-xl border border-[#e2ddc8] bg-[#f5f2e6] p-4 md:p-6">
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#064013] px-4 py-2.5 text-sm leading-relaxed text-[#f5f2e6]">
                {t.content}
              </div>
            </div>
          ) : (
            <div key={i} className="space-y-3">
              <div className="max-w-[92%] border-l-2 border-[#064013]/70 pl-4 text-sm leading-relaxed text-stone-800">
                {t.content}
              </div>
              {t.factories && t.factories.length > 0 && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {t.factories.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-lg border border-[#e2ddc8] bg-white p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/factories/${f.id}`}
                          className="line-clamp-1 text-sm font-semibold text-stone-900 hover:text-emerald-800"
                        >
                          {f.name}
                        </Link>
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                          {f.score}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {[f.tier, f.location, f.years ? `${f.years} 年` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-stone-600">
                        {f.reason}
                      </p>
                      {f.categoryRank && (
                        <p className="mt-1.5 text-xs font-medium text-emerald-900">
                          {f.categoryRank.category}类目第 {f.categoryRank.rank} / {f.categoryRank.total} 家
                        </p>
                      )}
                      {f.evidence.length > 0 && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer select-none font-medium text-[#064013] hover:underline">
                            为什么推荐它？（{f.evidence.length} 条证据）
                          </summary>
                          <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-relaxed text-stone-600">
                            {f.evidence.map((e, j) => (
                              <li key={j}>{e}</li>
                            ))}
                          </ul>
                          {f.subScores && (
                            <div className="mt-2 space-y-1">
                              {SCORING_FORMULA.dimensions.map((d) => {
                                const v = f.subScores?.[d.key];
                                if (v == null) return null;
                                return (
                                  <div key={d.key} className="flex items-center gap-1.5">
                                    <span className="w-14 shrink-0 text-[10px] text-stone-500">
                                      {d.label}
                                    </span>
                                    <div className="h-1.5 flex-1 rounded-full bg-stone-100">
                                      <div
                                        className="h-1.5 rounded-full bg-[#064013]/70"
                                        style={{ width: `${Math.min(100, v)}%` }}
                                      />
                                    </div>
                                    <span className="w-7 shrink-0 text-right text-[10px] text-stone-500">
                                      {v}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </details>
                      )}
                      <div className="mt-2.5 flex gap-2">
                        <Link
                          to={`/factories/${f.id}`}
                          className="rounded-md border border-stone-300 px-2.5 py-1 text-xs hover:bg-stone-100"
                        >
                          看详情
                        </Link>
                        <Link
                          to="/calculator"
                          className="rounded-md bg-[#064013] px-2.5 py-1 text-xs font-medium text-[#f5f2e6] hover:bg-emerald-800"
                        >
                          算到手价
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
        {chat.isPending && (
          <div className="border-l-2 border-[#064013]/70 pl-4 text-sm text-stone-500">
            正在为你筛厂…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {turns.length <= 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-[#c9c3ab] bg-white px-3.5 py-1.5 text-xs text-stone-600 transition-colors hover:border-[#064013] hover:text-[#064013]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="说出你要的品，如：500 件卫衣发美国…"
          className="h-11 flex-1 rounded-lg border border-[#c9c4ae] bg-white px-4 text-sm focus-visible:outline-2 focus-visible:outline-[#064013]"
        />
        <button
          type="submit"
          disabled={chat.isPending || !input.trim()}
          className="h-11 shrink-0 rounded-lg bg-[#064013] px-5 text-sm font-semibold text-[#f5f2e6] transition-colors hover:bg-emerald-800 disabled:opacity-40"
        >
          发送
        </button>
      </form>
    </div>
  );
}
