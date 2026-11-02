import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
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
  productImages: string[];
  tags: string[];
  subScores: Record<string, number | null> | null;
  categoryRank: { category: string; rank: number; total: number } | null;
  evidence: string[];
}

interface LinkedProduct {
  offer: {
    offerId: string;
    title: string;
    categoryName: string | null;
    unit: string | null;
    images: string[];
    priceTiers: { minQty: number; price: number }[];
    shopName: string | null;
    shopUrl: string | null;
  };
  factory: {
    id: number;
    name: string;
    tier: string | null;
    score: string | null;
  } | null;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  factories?: MatchedFactory[];
  product?: LinkedProduct | null;
}

const SUGGESTIONS = [
  "瑜伽裤 500 条，发德国",
  "找做连帽卫衣的工厂，预算到手价 $4 以内",
  "蓝牙耳机，先寄样品看看质量",
];

/* 作业状态流：每一行对应后端真实在做的事，只陈述过程、不虚报结果 */
const STAGES: { label: string; detail: string }[] = [
  { label: "解析采购需求", detail: "品类 · 数量 · 目的地 · 认证要求" },
  { label: "检索严选工厂库", detail: "数千家源头工厂同步比对" },
  { label: "交叉核验资质", detail: "评分 · 认证 · 履约记录" },
  { label: "撰写采购建议", detail: "推荐理由与风险提示" },
];
const STAGE_DELAYS = [900, 1900, 3000];

function SourcingStatus() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = STAGE_DELAYS.map((ms, i) =>
      window.setTimeout(() => setStep(i + 1), ms)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 leading-none">
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--sb-ink-40)]">
          AI Buyer
        </span>
        <span className="text-[11px] font-medium text-[var(--sb-teal)]">老采购</span>
        <span className="text-[10px] text-[var(--sb-ink-40)]">· 作业中</span>
      </div>
      <div className="border-l-2 border-[var(--sb-teal)]/60 pl-4">
        <ul className="space-y-1.5 py-0.5">
          {STAGES.slice(0, step + 1).map((s, i) => {
            const active = i === step;
            return (
              <li key={s.label} className="sb-stage flex items-baseline gap-2.5">
                {active ? (
                  <span className="sb-dot-live h-1.5 w-1.5 shrink-0 translate-y-[-1px] self-center rounded-full bg-[var(--sb-teal)]" />
                ) : (
                  <span className="self-center text-[11px] leading-none text-[var(--sb-teal)]">
                    ✓
                  </span>
                )}
                <span
                  className={`text-[13px] font-medium ${
                    active ? "text-[var(--sb-ink)]" : "text-[var(--sb-ink-40)]"
                  }`}
                >
                  {s.label}
                </span>
                <span className="text-[11px] tabular-nums text-[var(--sb-ink-40)]">
                  {s.detail}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default function BuyerChat() {
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      content:
        "你好，我是你的 AI 采购买手，干这行十几年了。说说你要什么品、多少量、发往哪里——我从几千家严选工厂里挑 3-6 家靠谱的给你，每一家为什么推荐、到手价多少，都摆证据说清楚。需求不靠谱我也会直说。",
    },
  ]);
  const [input, setInput] = useState("");
  const chat = trpc.ai.chat.useMutation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const prefilled = useRef(false);

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
            {
              role: "assistant",
              content: res.reply,
              factories: res.factories,
              product: (res as any).product ?? null,
            },
          ]),
        onError: () =>
          setTurns((ts) => [
            ...ts,
            {
              role: "assistant",
              content:
                "刚才网络抖了一下，没收到回复。你再说一次？如果反复失败，也可以直接去工厂库搜。",
            },
          ]),
      }
    );
  }

  // 从首页带过来的第一句话，自动发出
  useEffect(() => {
    const pre = params.get("prefill");
    if (pre && !prefilled.current) {
      prefilled.current = true;
      setParams({}, { replace: true });
      send(pre);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex h-[calc(100dvh-10rem)] max-w-3xl flex-col">
      {/* 对话区 */}
      <div className="sb-scroll flex-1 space-y-6 overflow-y-auto rounded-[20px] border border-[var(--sb-line)] bg-white p-4 md:p-7">
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--sb-teal)] px-4 py-2.5 text-sm leading-relaxed text-[#eef4f5]">
                {t.content}
              </div>
            </div>
          ) : (
            <div key={i} className="space-y-3">
              {/* 老采购身份签 */}
              <div className="flex items-center gap-2 leading-none">
                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--sb-ink-40)]">
                  AI Buyer
                </span>
                <span className="text-[11px] font-medium text-[var(--sb-teal)]">
                  老采购
                </span>
              </div>
              <div className="max-w-[94%] border-l-2 border-[var(--sb-teal)]/60 pl-4 text-sm leading-[1.75] whitespace-pre-wrap text-[var(--sb-ink)]">
                {t.content}
              </div>

              {/* 1688 商品卡 */}
              {t.product && (
                <div className="rounded-xl border border-[var(--sb-line)] bg-[var(--sb-paper)] p-4">
                  <div className="flex gap-3">
                    {t.product.offer.images[0] && (
                      <img
                        src={t.product.offer.images[0]}
                        alt=""
                        className="h-20 w-20 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold">
                        {t.product.offer.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--sb-ink-40)]">
                        {[t.product.offer.categoryName, t.product.offer.shopName]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {t.product.offer.priceTiers.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {t.product.offer.priceTiers.map((p, j) => (
                            <span key={j} className="text-xs">
                              <span className="font-semibold text-[var(--sb-teal)]">
                                ¥{p.price}
                              </span>
                              <span className="text-[var(--sb-ink-40)]">
                                {" "}
                                / {p.minQty}
                                {t.product?.offer.unit ?? "件"}起
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--sb-line)] pt-2.5">
                    {t.product.factory ? (
                      <Link
                        to={`/factories/${t.product.factory.id}`}
                        className="text-xs font-medium text-[var(--sb-teal)] underline-offset-4 hover:underline"
                      >
                        背后工厂在严选库：{t.product.factory.name}（
                        {t.product.factory.tier} · {t.product.factory.score} 分）→
                      </Link>
                    ) : (
                      <span className="sb-note rounded-md px-2 py-1 text-xs">
                        该店铺不在严选库，下单前建议验厂
                      </span>
                    )}
                    <Link
                      to="/calculator"
                      className="shrink-0 text-xs font-semibold text-[var(--sb-teal)] underline-offset-4 hover:underline"
                    >
                      算到手价 →
                    </Link>
                  </div>
                </div>
              )}

              {/* 工厂卡 */}
              {t.factories && t.factories.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {t.factories.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-xl border border-[var(--sb-line)] bg-white p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]"
                    >
                      {f.productImages && f.productImages.length > 0 && (
                        <div className="mb-3 flex gap-1.5">
                          {f.productImages.map((src, j) => (
                            <img
                              key={j}
                              src={src}
                              alt=""
                              loading="lazy"
                              className="h-16 w-16 rounded-lg border border-[var(--sb-line)] object-cover"
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/factories/${f.id}`}
                          className="line-clamp-1 text-sm font-semibold hover:text-[var(--sb-teal)]"
                        >
                          {f.name}
                        </Link>
                        <span className="shrink-0 rounded bg-[var(--sb-teal-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--sb-teal)]">
                          {f.score}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--sb-ink-40)]">
                        {[f.tier, f.location, f.years ? `${f.years} 年` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--sb-ink-60)]">
                        {f.reason}
                      </p>
                      {f.tags && f.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {f.tags.slice(0, 4).map((tg) => (
                            <span
                              key={tg}
                              className="rounded-full border border-[var(--sb-line)] px-2 py-0.5 text-[10px] text-[var(--sb-ink-60)]"
                            >
                              {tg}
                            </span>
                          ))}
                        </div>
                      )}
                      {f.categoryRank && (
                        <p className="mt-2 text-xs font-semibold text-[var(--sb-teal)]">
                          {f.categoryRank.category}类目第 {f.categoryRank.rank} /{" "}
                          {f.categoryRank.total} 家
                        </p>
                      )}
                      {f.evidence.length > 0 && (
                        <details className="mt-2.5 text-xs">
                          <summary className="cursor-pointer select-none font-medium text-[var(--sb-teal)] underline-offset-4 hover:underline">
                            为什么推荐它？（{f.evidence.length} 条证据）
                          </summary>
                          <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed text-[var(--sb-ink-60)]">
                            {f.evidence.map((e, j) => (
                              <li key={j}>{e}</li>
                            ))}
                          </ul>
                          {f.subScores && (
                            <div className="mt-2.5 space-y-1">
                              {SCORING_FORMULA.dimensions.map((d) => {
                                const v = f.subScores?.[d.key];
                                if (v == null) return null;
                                return (
                                  <div key={d.key} className="flex items-center gap-1.5">
                                    <span className="w-14 shrink-0 text-[10px] text-[var(--sb-ink-40)]">
                                      {d.label}
                                    </span>
                                    <div className="h-1.5 flex-1 rounded-full bg-[var(--sb-paper)]">
                                      <div
                                        className="h-1.5 rounded-full bg-[var(--sb-teal)]/70"
                                        style={{ width: `${Math.min(100, v)}%` }}
                                      />
                                    </div>
                                    <span className="w-7 shrink-0 text-right text-[10px] text-[var(--sb-ink-40)]">
                                      {v}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </details>
                      )}
                      <div className="mt-3 flex items-center gap-3 border-t border-[var(--sb-line)] pt-2.5">
                        <Link
                          to={`/factories/${f.id}`}
                          className="text-xs font-medium text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-teal)] hover:underline"
                        >
                          工厂档案 →
                        </Link>
                        <Link
                          to="/calculator"
                          className="text-xs font-semibold text-[var(--sb-teal)] underline-offset-4 hover:underline"
                        >
                          算到手价 →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
        {chat.isPending && <SourcingStatus />}
        <div ref={bottomRef} />
      </div>

      {/* 建议问题（仅首轮展示） */}
      {turns.length <= 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-[var(--sb-line)] bg-white px-3.5 py-1.5 text-xs text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-teal)] hover:text-[var(--sb-teal)]"
            >
              {s} →
            </button>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--sb-line)] bg-white p-2 shadow-[0_1px_2px_rgba(11,11,11,0.05)]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="说出你要的品，或直接粘贴 1688 商品链接…"
            className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[15px] placeholder:text-[var(--sb-ink-40)] focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={chat.isPending || !input.trim()}
            className="h-11 shrink-0 rounded-xl bg-[var(--sb-teal)] px-5 text-sm font-semibold text-[#eef4f5] transition-colors hover:bg-[var(--sb-teal-hover)] disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  );
}
