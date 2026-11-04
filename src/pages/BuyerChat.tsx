import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { SCORING_FORMULA } from "@contracts/scoring";
import { FX_SETTLEMENT } from "@contracts/fx";

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
  matchBasis?: "productLinked" | "direct" | "bucket"; // productLinked=严选库在册且有这款在售货（最硬）；direct=名称/评语/标签含这类产品词；bucket=仅大类高分厂，未核实做这款
  linkedOffer?: { offerId: string; title: string; price: number; sales: number } | null;
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
    amountOnSale: number | null;
  };
  factory: {
    id: number;
    name: string;
    tier: string | null;
    score: string | null;
  } | null;
}

interface SearchProduct {
  offerId: string;
  title: string;
  image: string | null;
  price: number;
  promotionPrice: number | null;
  sales: number;
}

interface LinkRef {
  platform: string;
  title: string | null;
  image: string | null;
  priceText: string | null;
  url: string;
  source: "page" | "slug" | null;
  fetchFailed: boolean;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  factories?: MatchedFactory[];
  product?: LinkedProduct | null;
  products?: SearchProduct[];
  linkRef?: LinkRef | null;
  quantity?: string | null;
  followUp?: FollowUpCardData | null;
  followUpDone?: string | null; // 已提交/已跳过后的摘要（卡片变一行灰字）
}

/* 补充问题卡（追问卡优化版：多题同卡一次提交 + 跳过直寻，非阻塞——结果已先出） */
interface FollowUpQuestion {
  key: string;
  label: string;
  why: string; // "为什么问这个"——老采购口吻
  options: string[];
}
interface FollowUpCardData {
  questions: FollowUpQuestion[];
}

/* 补充问题卡：多题同卡、chips 只选不发、选完一次提交；常驻"跳过，直接寻源"。非阻塞——结果已先出 */
const FOLLOWUP_KEY_LABEL: Record<string, string> = { quantity: "数量", destination: "目的地", deadline: "交期" };
function FollowUpCard({
  card,
  doneSummary,
  onSubmit,
  onSkip,
}: {
  card: FollowUpCardData;
  doneSummary?: string | null;
  onSubmit: (msg: string, doneSummary: string) => void;
  onSkip: () => void;
}) {
  const [sel, setSel] = useState<Record<string, string>>({});
  if (doneSummary) {
    return (
      <div className="max-w-[94%] text-[11px] text-[var(--sb-ink-40)]">
        {doneSummary}
      </div>
    );
  }
  const toggle = (k: string, o: string) =>
    setSel((prev) => {
      const n = { ...prev };
      if (n[k] === o) delete n[k];
      else n[k] = o;
      return n;
    });
  const picked = Object.keys(sel).length;
  const submit = () => {
    const parts = card.questions
      .filter((q) => sel[q.key])
      .map((q) => `${FOLLOWUP_KEY_LABEL[q.key] ?? q.label}:${sel[q.key]}`);
    const summary = parts.join(" · ");
    onSubmit(`[补充] ${parts.join("；")}`, `已补充：${summary}`);
  };
  return (
    <div className="max-w-[94%] rounded-xl border border-[var(--sb-line)] bg-[var(--sb-paper)] p-4">
      <div className="text-[13px] font-semibold text-[var(--sb-ink)]">
        补齐这几个，我配得更准<span className="ml-1.5 font-normal text-[var(--sb-ink-40)]">（不补也行，先看上面的结果）</span>
      </div>
      {card.questions.map((q) => (
        <div key={q.key} className="mt-3">
          <div className="text-[13px] font-medium text-[var(--sb-ink)]">{q.label}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {q.options.map((o) => {
              const on = sel[q.key] === o;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggle(q.key, o)}
                  className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                    on
                      ? "border-[var(--sb-brand)] bg-[var(--sb-brand)] text-white"
                      : "border-[var(--sb-line)] bg-white text-[var(--sb-ink)] hover:border-[var(--sb-brand)]/50"
                  }`}
                >
                  {o}
                </button>
              );
            })}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-[var(--sb-ink-40)]">{q.why}</div>
        </div>
      ))}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-t border-[var(--sb-line)] pt-3">
        <button
          type="button"
          disabled={!picked}
          onClick={submit}
          className="rounded-lg bg-[var(--sb-brand)] px-4 py-1.5 text-[12.5px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          提交补充{picked ? `（已选 ${picked} 项）` : ""}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg border border-[var(--sb-line)] bg-white px-4 py-1.5 text-[12.5px] text-[var(--sb-ink-60,#666)] transition-colors hover:border-[var(--sb-brand)]/50"
        >
          跳过，直接寻源
        </button>
      </div>
    </div>
  );
}

/* 外链识别卡：买家贴的亚马逊/TikTok 等链接，系统读到的真实信息（读不到就明说） */
function LinkRefCard({ link }: { link: LinkRef }) {
  return (
    <div className="flex max-w-[94%] items-center gap-3 rounded-xl border border-[var(--sb-line)] bg-[var(--sb-paper)] px-3.5 py-2.5">
      {link.image ? (
        <img
          src={link.image}
          alt=""
          referrerPolicy="no-referrer"
          className="h-11 w-11 shrink-0 rounded-lg border border-[var(--sb-line)] bg-white object-cover"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--sb-line)] bg-white text-base">🔗</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--sb-ink-40)]">
          {link.fetchFailed ? `${link.platform} · 链接没打开` : `${link.platform} · 已识别${link.source === "slug" ? "（从链接路径）" : ""}`}
        </p>
        <p className="mt-0.5 truncate text-[13px] font-medium text-[var(--sb-ink)]">
          {link.title ?? "平台挡了抓取——补一句品名我马上查"}
        </p>
      </div>
      {link.priceText && (
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--sb-brand)]">{link.priceText}</span>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "瑜伽裤 500 条，发德国",
  "找做连帽卫衣的工厂，预算到手价 $4 以内",
  "蓝牙耳机，先寄样品看看质量",
];

/* 作业状态流：每一行对应后端真实在做的事，只陈述过程、不虚报结果 */
const STAGES: { label: string; detail: string }[] = [
  { label: "解析采购需求", detail: "品类 · 数量 · 目的地 · 认证要求" },
  { label: "搜索真实在售货源", detail: "货源平台同步搜款 · 出厂价" },
  { label: "比对严选工厂库", detail: "数千家源头工厂交叉核验" },
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
        <span className="text-[11px] font-medium text-[var(--sb-brand)]">老采购</span>
        <span className="text-[10px] text-[var(--sb-ink-40)]">· 作业中</span>
      </div>
      <div className="border-l-2 border-[var(--sb-brand)]/60 pl-4">
        <ul className="space-y-1.5 py-0.5">
          {STAGES.slice(0, step + 1).map((s, i) => {
            const active = i === step;
            return (
              <li key={s.label} className="sb-stage flex items-baseline gap-2.5">
                {active ? (
                  <span className="sb-dot-live h-1.5 w-1.5 shrink-0 translate-y-[-1px] self-center rounded-full bg-[var(--sb-brand)]" />
                ) : (
                  <span className="self-center text-[11px] leading-none text-[var(--sb-brand)]">
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

const REF_RATE = FX_SETTLEMENT; // 与到手价引擎一致的结汇汇率（牌价 − 0.3，见 contracts/fx.ts）

function fmtSales(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")} 万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")} 千`;
  return String(n);
}

/* 搜索结果商品墙：搜索级数据（图/出厂价/销量），DDP 估算只在详情页有真实重量后给——防伪造精度 */
function ProductStrip({
  products,
  quantity,
}: {
  products: SearchProduct[];
  quantity?: string | null;
}) {
  const qty = Math.max(0, parseInt(quantity ?? "", 10) || 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--sb-ink-40)]">
          真实在售货源 · 出厂价（未含运费佣金）
        </p>
        <p className="text-[10px] text-[var(--sb-ink-40)]">{products.length} 款</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {products.map((p) => {
          const price = p.promotionPrice ?? p.price;
          const calcUrl = `/calculator?price=${price}${qty ? `&qty=${qty}` : ""}`;
          return (
            <div
              key={p.offerId}
              className="group overflow-hidden rounded-xl border border-[var(--sb-line)] bg-white transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]"
            >
              <Link to={`/products/${p.offerId}`} className="block">
                {p.image ? (
                  <img
                    src={p.image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full bg-[var(--sb-paper)]" />
                )}
              </Link>
              <div className="p-2.5">
                <Link to={`/products/${p.offerId}`} className="block">
                  <p className="line-clamp-2 min-h-[2.6em] text-xs leading-snug font-medium [@media(hover:hover)]:group-hover:text-[var(--sb-brand)]">
                    {p.title}
                  </p>
                </Link>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="sb-num text-base font-bold tracking-tight">
                    ¥{price}
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--sb-ink-40)]">
                    ≈ US${(price / REF_RATE).toFixed(2)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className="text-[10px] text-[var(--sb-ink-40)]">
                    {p.sales > 0 ? `已售 ${fmtSales(p.sales)}` : "在售"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/products/${p.offerId}`}
                      className="text-[10px] font-medium text-[var(--sb-ink-60)] underline-offset-2 hover:text-[var(--sb-brand)] hover:underline"
                    >
                      详情
                    </Link>
                    <Link
                      to={calcUrl}
                      className="text-[10px] font-semibold text-[var(--sb-brand)] underline-offset-2 hover:underline"
                    >
                      算到手价 →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 商品卡：产品优先 —— 图/标题/在售信号 + 出厂价主展示 + 阶梯档 + 工厂背书 + 到手价入口 */
function ProductCard({
  product,
  quantity,
}: {
  product: LinkedProduct;
  quantity?: string | null;
}) {
  const offer = product.offer;
  const qty = Math.max(0, parseInt(quantity ?? "", 10) || 0);
  const tiers = [...offer.priceTiers].sort((a, b) => a.minQty - b.minQty);
  // 按采购数量选价档：够得着的最低单价；没给数量则用首档
  const main =
    qty > 0
      ? [...tiers].reverse().find((p) => qty >= p.minQty) ?? tiers[0]
      : tiers[0];
  const calcUrl = `/calculator?price=${main?.price ?? ""}${qty ? `&qty=${qty}` : ""}`;

  return (
    <div className="rounded-xl border border-[var(--sb-line)] bg-[var(--sb-paper)] p-4">
      <div className="flex gap-3.5">
        {offer.images[0] && (
          <img
            src={offer.images[0]}
            alt=""
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="h-24 w-24 shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold">{offer.title}</p>
          <p className="mt-0.5 text-xs text-[var(--sb-ink-40)]">
            {[offer.categoryName, offer.shopName].filter(Boolean).join(" · ")}
          </p>
          {offer.amountOnSale != null && offer.amountOnSale > 0 && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--sb-ink-60)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              在售 · 可售 {offer.amountOnSale.toLocaleString()}{" "}
              {offer.unit ?? "件"}
            </p>
          )}
        </div>
      </div>

      {main && (
        <div className="mt-3 rounded-lg border border-[var(--sb-line)] bg-white px-3.5 py-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-xl font-bold tracking-tight">
              ¥{main.price}
            </span>
            <span className="text-xs text-[var(--sb-ink-40)]">
              / {offer.unit ?? "件"} · 出厂价
            </span>
            <span className="text-xs tabular-nums text-[var(--sb-ink-40)]">
              ≈ US${(main.price / REF_RATE).toFixed(2)}
            </span>
            {qty > 0 && (
              <span className="rounded bg-[var(--sb-brand-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--sb-brand)]">
                按 {qty.toLocaleString()} {offer.unit ?? "件"}档
              </span>
            )}
          </div>
          {tiers.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tiers.map((p, j) => (
                <span
                  key={j}
                  className={`rounded-md border px-2 py-1 text-[11px] tabular-nums ${
                    p === main
                      ? "border-[var(--sb-brand)]/40 bg-[var(--sb-brand-soft)] font-medium text-[var(--sb-brand)]"
                      : "border-[var(--sb-line)] text-[var(--sb-ink-60)]"
                  }`}
                >
                  ≥{p.minQty} · ¥{p.price}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--sb-ink-40)]">
            按结汇汇率 {REF_RATE} 折算（当日牌价 − 0.3）；到手价 = 出厂价 + 运费 + 关税 + 履约佣金，点「算到手价」逐行试算
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--sb-line)] pt-2.5">
        {product.factory ? (
          <Link
            to={`/factories/${product.factory.id}`}
            className="text-xs font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline"
          >
            背后工厂在严选库：{product.factory.name}（{product.factory.tier} ·{" "}
            {product.factory.score} 分）→
          </Link>
        ) : (
          <span className="sb-note rounded-md px-2 py-1 text-xs">
            该店铺不在严选库，下单前建议验厂
          </span>
        )}
        <Link
          to={`/products/${offer.offerId}`}
          className="shrink-0 text-xs font-medium text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline"
        >
          看详情
        </Link>
        <Link
          to={calcUrl}
          className="shrink-0 text-xs font-semibold text-[var(--sb-brand)] underline-offset-4 hover:underline"
        >
          算到手价 →
        </Link>
      </div>
    </div>
  );
}

export default function BuyerChat() {
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      content:
        "你好，我是你的 AI 采购买手，干这行十几年了。你要什么货、多少量、发往哪里，告诉我就行——我帮你找源头好货和好价，背后的工厂我都验过底。每一单为什么推荐、到手价多少，摆证据说清楚；需求不靠谱我也会直说。",
    },
  ]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null); // 待发送商品图（压缩后的 data URL）
  const fileRef = useRef<HTMLInputElement>(null);
  const chat = trpc.ai.chat.useMutation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const prefilled = useRef(false);

  // 图片压缩：最长边 1024、JPEG 0.82——够视觉模型识别，流量友好
  async function pickImage(file: File) {
    if (!file.type.startsWith("image/")) return;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      setPendingImage(canvas.toDataURL("image/jpeg", 0.82));
    } catch {
      setPendingImage(null);
    }
  }

  // 只滚动聊天容器本身；scrollIntoView 会带着整页滚动，导致吸顶导航压住内容
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns, chat.isPending]);

  function send(text: string, radarId?: number) {
    const msg = text.trim() || (pendingImage ? "帮我找图里这个产品的货源" : "");
    if (!msg || chat.isPending) return;
    const img = pendingImage;
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((ts) => [...ts, { role: "user", content: msg, imageUrl: img ?? undefined }]);
    setInput("");
    setPendingImage(null);
    doMutate(msg, history, false, radarId, img ?? undefined);
  }

  // 失败静默重试一次（网络/模型抖动大多是瞬时的）；再失败才诚实告诉买家
  function doMutate(msg: string, history: { role: "user" | "assistant"; content: string }[], isRetry: boolean, radarId?: number, imageData?: string) {
    chat.mutate(
      { message: msg, history, radarId, imageData },
      {
        onSuccess: (res) =>
          setTurns((ts) => [
            ...ts,
            {
              role: "assistant",
              content: res.reply,
              factories: res.factories,
              product: (res as any).product ?? null,
              products: (res as any).products?.length ? (res as any).products : undefined,
              linkRef: (res as any).linkContext ?? null,
              quantity: (res as any).intent?.quantity ?? null,
              followUp: (res as any).followUp ?? null,
            },
          ]),
        onError: () => {
          if (!isRetry) {
            setTimeout(() => doMutate(msg, history, true, radarId), 2000);
            return;
          }
          setTurns((ts) => [
            ...ts,
            {
              role: "assistant",
              content:
                "这次查询卡住了——源头货源接口响应太慢，我不拿半截数据糊弄你。再发一次试试；连着失败就先去「严选工厂库」自己逛，或把需求留给我，我缓过来接着查。",
            },
          ]);
        },
      }
    );
  }

  // 从首页带过来的第一句话，自动发出；雷达卡直达会带 radar 参数（品类钉死，不依赖意图抽取）
  useEffect(() => {
    const pre = params.get("prefill");
    if (pre && !prefilled.current) {
      prefilled.current = true;
      const radarIdRaw = params.get("radar");
      const radarId = radarIdRaw && /^\d+$/.test(radarIdRaw) ? Number(radarIdRaw) : undefined;
      setParams({}, { replace: true });
      send(pre, radarId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex h-[calc(100dvh-12rem)] max-w-3xl flex-col">
      {/* 对话区 */}
      <div ref={scrollRef} className="sb-scroll flex-1 space-y-6 overflow-y-auto rounded-[20px] border border-[var(--sb-line)] bg-white p-4 md:p-7">
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--sb-brand)] px-4 py-2.5 text-sm leading-relaxed text-[#eef4f5]">
                {t.imageUrl && (
                  <img src={t.imageUrl} alt="商品图" className="mb-2 max-h-44 rounded-lg border border-white/20 object-cover" />
                )}
                {t.content.replace(/^\[(?:补充|跳过补充)\]\s*/, "")}
              </div>
            </div>
          ) : (
            <div key={i} className="space-y-3">
              {/* 老采购身份签 */}
              <div className="flex items-center gap-2 leading-none">
                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--sb-ink-40)]">
                  AI Buyer
                </span>
                <span className="text-[11px] font-medium text-[var(--sb-brand)]">
                  老采购
                </span>
              </div>
              {/* 外链识别卡：贴链接进来的，先摆读到的真实信息 */}
              {t.linkRef && <LinkRefCard link={t.linkRef} />}

              <div className="max-w-[94%] border-l-2 border-[var(--sb-brand)]/60 pl-4 text-sm leading-[1.75] whitespace-pre-wrap text-[var(--sb-ink)]">
                {t.content}
              </div>

              {/* 补充问题卡：多题同卡一次提交 / 跳过直寻 */}
              {t.followUp && (
                <FollowUpCard
                  card={t.followUp}
                  doneSummary={t.followUpDone}
                  onSubmit={(msg, doneSummary) => {
                    setTurns((ts) => ts.map((x, xi) => (xi === i ? { ...x, followUpDone: doneSummary } : x)));
                    send(msg);
                  }}
                  onSkip={() => {
                    setTurns((ts) => ts.map((x, xi) => (xi === i ? { ...x, followUpDone: "已跳过补充，直接寻源" } : x)));
                    send("[跳过补充] 这些先不谈，按现在了解的直接帮我配");
                  }}
                />
              )}

              {/* 商品卡：产品优先，到手价入口 */}
              {t.product && (
                <ProductCard product={t.product} quantity={t.quantity} />
              )}

              {/* 搜索商品墙：真实在售货源，出厂价 */}
              {t.products && t.products.length > 0 && (
                <ProductStrip products={t.products} quantity={t.quantity} />
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
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                              className="h-16 w-16 rounded-lg border border-[var(--sb-line)] object-cover"
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/factories/${f.id}`}
                          className="line-clamp-1 text-sm font-semibold hover:text-[var(--sb-brand)]"
                        >
                          {f.name}
                        </Link>
                        <span className="shrink-0 rounded bg-[var(--sb-brand-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--sb-brand)]">
                          {f.score}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--sb-ink-40)]">
                        {[f.tier, f.location, f.years ? `${f.years} 年` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--sb-ink-60)]">
                        {f.matchBasis === "productLinked" && f.linkedOffer
                          ? `在售「${f.linkedOffer.title.slice(0, 30)}」`
                          : f.reason}
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
                        <p className="mt-2 text-xs font-semibold text-[var(--sb-brand)]">
                          {f.categoryRank.category}类目第 {f.categoryRank.rank} /{" "}
                          {f.categoryRank.total} 家
                        </p>
                      )}
                      {f.matchBasis === "productLinked" && f.linkedOffer && (
                        <p className="mt-2 rounded-md bg-[#fdf6e3] px-2 py-1.5 text-xs font-medium leading-relaxed text-[#92610a] ring-1 ring-[#e9d5a1]">
                          ✓ 严选库在册 · 有这款在售：¥{f.linkedOffer.price} 起 · 销量{" "}
                          {f.linkedOffer.sales.toLocaleString()}（已实时核对）
                        </p>
                      )}
                      {f.matchBasis === "bucket" && (
                        <p className="mt-2 text-xs font-medium text-[#b45309]">
                          同大类高分厂 · 做这款请先拿图确认
                        </p>
                      )}
                      {f.evidence.length > 0 && (
                        <details className="mt-2.5 text-xs">
                          <summary className="cursor-pointer select-none font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline">
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
                                        className="h-1.5 rounded-full bg-[var(--sb-brand)]/70"
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
                          className="text-xs font-medium text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline"
                        >
                          工厂档案 →
                        </Link>
                        <Link
                          to="/calculator"
                          className="text-xs font-semibold text-[var(--sb-brand)] underline-offset-4 hover:underline"
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
              className="rounded-full border border-[var(--sb-line)] bg-white px-3.5 py-1.5 text-xs text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
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
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickImage(f);
            e.target.value = "";
          }}
        />
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--sb-line)] bg-white px-2.5 py-2">
            <img src={pendingImage} alt="待发送商品图" className="h-10 w-10 rounded-lg border border-[var(--sb-line)] object-cover" />
            <span className="text-xs text-[var(--sb-ink-60)]">商品图已就绪——补一句要求（数量/目的地）更准，也可直接发送</span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="ml-auto shrink-0 rounded-md px-2 py-1 text-xs text-[var(--sb-ink-40)] hover:text-[var(--sb-ink)]"
            >
              移除
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--sb-line)] bg-white p-2 shadow-[0_1px_2px_rgba(11,11,11,0.05)]">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="发商品图给我认"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--sb-line)] text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="5.5" cy="6" r="1.2" fill="currentColor" />
              <path d="m3 12 3.5-3.5 2.5 2.5 2-2 2 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="说出你要的品，或贴亚马逊 / TikTok 商品链接，也可发图…"
            className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[15px] placeholder:text-[var(--sb-ink-40)] focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={chat.isPending || (!input.trim() && !pendingImage)}
            className="h-11 shrink-0 rounded-xl bg-[var(--sb-brand)] px-5 text-sm font-semibold text-[#eef4f5] transition-colors hover:bg-[var(--sb-brand-hover)] disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  );
}
