import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { SCORING_FORMULA } from "@contracts/scoring";
import { FX_SETTLEMENT } from "@contracts/fx";
import { useT } from "@/i18n";
import { unitLabel } from "@/lib/unit";
import { getAnonId, useAuth } from "@/auth";
import { AttachButton, PickerBlockedHint } from "@/components/AttachButton";
import { compressImageToDataURL } from "@/lib/imageCompress";

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
  echoIntent?: EchoIntent | null; // 「我理解的需求」来源行的展示值（product/quantity/destination/region/budgetNote）
  intentSources?: IntentSourcesData | null;
  followUp?: FollowUpCardData | null;
  followUpDone?: string | null; // 已提交/已跳过后的摘要（卡片变一行灰字）
  manualQuote?: boolean; // 建材工业桶：费率估算不适用，卡片换"人工核价"提示
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

/* 字段级来源标注（四态）：AI 推断的必须亮明身份，缺的不猜 */
interface SourceNoteData {
  source: "user" | "ai" | "derived" | "unknown";
  confidence: number | null;
  note: { zh: string; en: string };
}
interface IntentSourcesData {
  product: SourceNoteData;
  quantity: SourceNoteData;
  destination: SourceNoteData;
  budget: SourceNoteData;
  region: SourceNoteData;
}

/* 「我理解的需求」来源行：逐字段亮明 你说的 / AI推断；unknown 不显示（缺失项由追问卡负责） */
interface EchoIntent {
  product: string | null;
  quantity: number | null;
  destination?: string | null;
  region?: string | null;
  budgetNote?: string | null;
}
function IntentEcho({ sources, intent }: { sources: IntentSourcesData; intent?: EchoIntent | null }) {
  const { t, lang } = useT();
  const items: { label: string; value: string; n: SourceNoteData }[] = [];
  const push = (label: string, value: string | number | null, n: SourceNoteData) => {
    if (value == null || n.source === "unknown") return;
    items.push({ label, value: String(value), n });
  };
  push(t("chat.echoProduct"), intent?.product ?? null, sources.product);
  push(t("chat.echoQty"), intent?.quantity ?? null, sources.quantity);
  push(t("chat.echoDest"), intent?.destination ?? null, sources.destination);
  push(t("chat.echoRegion"), intent?.region ?? null, sources.region);
  push(t("chat.echoBudget"), intent?.budgetNote?.replace(/^(预算|目标价|budget[:：]?\s*)/i, "") ?? null, sources.budget);
  if (!items.length) return null;
  return (
    <div className="max-w-[94%] flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--sb-ink-40)]">
      <span className="font-semibold uppercase tracking-[0.14em]">{t("chat.echoTitle")}</span>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <span className="text-[var(--sb-ink-60)]">{it.label} {it.value}</span>
          <span
            title={lang !== "zh" ? it.n.note.en : it.n.note.zh}
            className={
              it.n.source === "user"
                ? "rounded-full border border-[var(--sb-line)] px-1.5 py-px text-[9px] text-[var(--sb-ink-40)]"
                : "rounded-full border border-amber-300/70 bg-amber-50 px-1.5 py-px text-[9px] font-medium text-amber-700"
            }
          >
            {it.n.source === "user" ? t("chat.srcUser") : `${t("chat.srcAi")}${it.n.confidence != null ? ` ${Math.round(it.n.confidence * 100)}%` : ""}`}
          </span>
        </span>
      ))}
    </div>
  );
}

/* 补充问题卡：多题同卡、chips 只选不发、选完一次提交；常驻"跳过，直接寻源"。非阻塞——结果已先出 */
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
  const { t } = useT();
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
      .map((q) => `${t(`chat.followKey.${q.key}`) ?? q.label}:${sel[q.key]}`);
    const summary = parts.join(" · ");
    onSubmit(`[补充] ${parts.join("；")}`, `${t("chat.followAddedPrefix")}${summary}`);
  };
  return (
    <div className="max-w-[94%] rounded-xl border border-[var(--sb-line)] bg-[var(--sb-paper)] p-4">
      <div className="text-[13px] font-semibold text-[var(--sb-ink)]">
        {t("chat.followTitle")}<span className="ml-1.5 font-normal text-[var(--sb-ink-40)]">{t("chat.followHint")}</span>
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
          {t("chat.followSubmit")}{picked ? t("chat.followSubmitPicked", { n: picked }) : ""}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg border border-[var(--sb-line)] bg-white px-4 py-1.5 text-[12.5px] text-[var(--sb-ink-60,#666)] transition-colors hover:border-[var(--sb-brand)]/50"
        >
          {t("chat.followSkip")}
        </button>
      </div>
    </div>
  );
}

/* 外链识别卡：买家贴的亚马逊/TikTok 等链接，系统读到的真实信息（读不到就明说） */
function LinkRefCard({ link }: { link: LinkRef }) {
  const { t } = useT();
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
          {link.fetchFailed ? `${link.platform} · ${t("chat.linkOpenFail")}` : `${link.platform} · ${t("chat.linkRecognized")}${link.source === "slug" ? t("chat.linkFromSlug") : ""}`}
        </p>
        <p className="mt-0.5 truncate text-[13px] font-medium text-[var(--sb-ink)]">
          {link.title ?? t("chat.linkNoTitle")}
        </p>
      </div>
      {link.priceText && (
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--sb-brand)]">{link.priceText}</span>
      )}
    </div>
  );
}

/* 作业状态流：每一行对应后端真实在做的事，只陈述过程、不虚报结果 */
const STAGE_DELAYS = [900, 1900, 3000];

function SourcingStatus() {
  const [step, setStep] = useState(0);
  const { t } = useT();
  const stages = t("chat.stages") as { label: string; detail: string }[];

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
        <span className="text-[11px] font-medium text-[var(--sb-brand)]">{t("chat.aiBuyerTag")}</span>
        <span className="text-[10px] text-[var(--sb-ink-40)]">{t("chat.working")}</span>
      </div>
      <div className="border-l-2 border-[var(--sb-brand)]/60 pl-4">
        <ul className="space-y-1.5 py-0.5">
          {stages.slice(0, step + 1).map((s, i) => {
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

function fmtSales(n: number, lang: string = "zh"): string {
  if (lang !== "zh") return n.toLocaleString("en-US");
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")} 万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")} 千`;
  return String(n);
}

/* 搜索结果商品墙：搜索级数据（图/出厂价/销量），DDP 估算只在详情页有真实重量后给——防伪造精度 */
function ProductStrip({
  products,
  quantity,
  manualQuote,
}: {
  products: SearchProduct[];
  quantity?: string | null;
  manualQuote?: boolean;
}) {
  const qty = Math.max(0, parseInt(quantity ?? "", 10) || 0);
  const { t, lang } = useT();
  // 佣金费率表 v1.0（单一事实源在后端 commission_rules 表；卡片按 B 档估，显式标注）
  const commissionQ = trpc.pricing.commissionTable.useQuery(undefined, { staleTime: 60 * 60_000 });
  const feeRule = (amtUsd: number) =>
    commissionQ.data?.find(
      (r) => r.riskTier === "B" && r.amountFrom <= amtUsd && (r.amountTo === null || amtUsd < r.amountTo)
    );
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--sb-ink-40)]">
          {t("chat.stripTitle")}
        </p>
        <p className="text-[10px] text-[var(--sb-ink-40)]">{t("chat.stripCount", { n: products.length })}</p>
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
                {(() => {
                  // 建材工业桶：费率估算不适用，换人工核价提示（防伪造精度）
                  if (manualQuote) {
                    return (
                      <p className="mt-1 border-t border-dashed border-[var(--sb-line)] pt-1 text-[10px] leading-snug text-[var(--sb-ink-40)]">
                        {t("chat.manualQuoteLine")}
                      </p>
                    );
                  }
                  const rule = feeRule(((qty || 1) * price) / REF_RATE);
                  if (!rule) return null;
                  const minApplied = (((qty || 1) * price) / REF_RATE) * rule.rate < rule.minFee;
                  return (
                    <>
                      <p className="mt-1 text-[10px] leading-snug text-[var(--sb-ink-40)]">
                        {t("chat.feeLine", { rate: parseFloat((rule.rate * 100).toFixed(1)) })}
                        {minApplied ? t("chat.feeMin") : ""}
                      </p>
                      <p className="mt-1 border-t border-dashed border-[var(--sb-line)] pt-1 text-[10px] leading-snug text-[var(--sb-ink-40)]">
                        {t("chat.diyLine")}
                      </p>
                    </>
                  );
                })()}
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className="text-[10px] text-[var(--sb-ink-40)]">
                    {p.sales > 0 ? t("chat.sold", { n: fmtSales(p.sales, lang) }) : t("chat.onSale")}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/products/${p.offerId}`}
                      className="text-[10px] font-medium text-[var(--sb-ink-60)] underline-offset-2 hover:text-[var(--sb-brand)] hover:underline"
                    >
                      {t("chat.details")}
                    </Link>
                    <Link
                      to={calcUrl}
                      className="text-[10px] font-semibold text-[var(--sb-brand)] underline-offset-2 hover:underline"
                    >
                      {t("chat.calcLink")}
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
  manualQuote,
}: {
  product: LinkedProduct;
  quantity?: string | null;
  manualQuote?: boolean;
}) {
  const offer = product.offer;
  const qty = Math.max(0, parseInt(quantity ?? "", 10) || 0);
  const { t, lang } = useT();
  const { me } = useAuth();
  const nav = useNavigate();
  const inquireMut = trpc.orders.create.useMutation({
    onSuccess: (r) => nav(`/orders/${r.orderId}`),
  });
  // 佣金费率表 v1.0（单一事实源在后端 commission_rules 表；卡片按 B 档估，显式标注）
  const commissionQ = trpc.pricing.commissionTable.useQuery(undefined, { staleTime: 60 * 60_000 });
  const feeRule = (amtUsd: number) =>
    commissionQ.data?.find(
      (r) => r.riskTier === "B" && r.amountFrom <= amtUsd && (r.amountTo === null || amtUsd < r.amountTo)
    );
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
              {t("chat.onSaleStock", { n: offer.amountOnSale.toLocaleString(), unit: unitLabel(offer.unit, lang, t) })}
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
              {t("chat.perUnitExw", { unit: unitLabel(offer.unit, lang, t) })}
            </span>
            <span className="text-xs tabular-nums text-[var(--sb-ink-40)]">
              ≈ US${(main.price / REF_RATE).toFixed(2)}
            </span>
            {qty > 0 && (
              <span className="rounded bg-[var(--sb-brand-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--sb-brand)]">
                {t("chat.qtyTier", { qty: qty.toLocaleString(), unit: unitLabel(offer.unit, lang, t) })}
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
            {t("chat.fxNote", { rate: REF_RATE })}
          </p>
          {(() => {
            // 建材工业桶：费率估算不适用，换人工核价提示（防伪造精度）
            if (manualQuote) {
              return (
                <p className="mt-1 border-t border-dashed border-[var(--sb-line)] pt-1 text-[10px] leading-snug text-[var(--sb-ink-40)]">
                  {t("chat.manualQuoteLine")}
                </p>
              );
            }
            const rule = feeRule(((qty || 1) * main.price) / REF_RATE);
            if (!rule) return null;
            const minApplied = (((qty || 1) * main.price) / REF_RATE) * rule.rate < rule.minFee;
            return (
              <>
                <p className="mt-1 text-[10px] leading-snug text-[var(--sb-ink-40)]">
                  {t("chat.feeLine", { rate: parseFloat((rule.rate * 100).toFixed(1)) })}
                  {minApplied ? t("chat.feeMin") : ""}
                </p>
                <p className="mt-1 border-t border-dashed border-[var(--sb-line)] pt-1 text-[10px] leading-snug text-[var(--sb-ink-40)]">
                  {t("chat.diyLine")}
                </p>
              </>
            );
          })()}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--sb-line)] pt-2.5">
        {product.factory ? (
          <Link
            to={`/factories/${product.factory.id}`}
            className="text-xs font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline"
          >
            {t("chat.factoryVetted", { name: product.factory.name, tier: product.factory.tier ?? "", score: product.factory.score ?? "—" })}
          </Link>
        ) : (
          <span className="sb-note rounded-md px-2 py-1 text-xs">
            {t("chat.shopNotVetted")}
          </span>
        )}
        <Link
          to={`/products/${offer.offerId}`}
          className="shrink-0 text-xs font-medium text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline"
        >
          {t("chat.viewDetails")}
        </Link>
        <button
          type="button"
          disabled={inquireMut.isPending}
          onClick={() => {
            if (!me) { nav("/login?next=/buyer"); return; }
            inquireMut.mutate({
              offerId: String(offer.offerId),
              productTitle: offer.title,
              productImage: offer.images[0] ?? undefined,
              quantity: qty || undefined,
            });
          }}
          className="shrink-0 rounded-md bg-[var(--sb-brand)] px-2.5 py-1 text-xs font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)] disabled:opacity-40"
        >
          {t("orders.ctaInquire")}
        </button>
        <Link
          to={calcUrl}
          className="shrink-0 text-xs font-semibold text-[var(--sb-brand)] underline-offset-4 hover:underline"
        >
          {t("chat.calcLink")}
        </Link>
      </div>
    </div>
  );
}

export default function BuyerChat() {
  const { lang, t } = useT();
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      content: t("chat.greeting"),
    },
  ]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null); // 待发送商品图（压缩后的 data URL）
  const [pendingFile, setPendingFile] = useState<string | null>(null); // 待发送图纸/文档文件名（内容不入库不进模型，走 48h 人工核价通道）
  const [imgError, setImgError] = useState<string | null>(null); // 图片问题必须显式可见，绝不静默
  // M3a 会话记忆：threadId 续写；anonId 匿名设备 ID（登录后服务端归并）
  const { me } = useAuth();
  const anonIdRef = useRef<string | undefined>(undefined);
  if (anonIdRef.current === undefined) anonIdRef.current = getAnonId();
  const [threadId, setThreadId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const threadsQ = trpc.threads.list.useQuery(undefined, { enabled: !!me && showHistory, staleTime: 10_000 });
  const utils = trpc.useUtils();
  const chat = trpc.ai.chat.useMutation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const prefilled = useRef(false);

  // 图片压缩：最长边 1024、JPEG 0.82——够视觉模型识别，流量友好
  // 两条解码路径：createImageBitmap 优先，失败回退 <img>+canvas（iPhone 拍照默认 HEIC，
  // iOS Safari 的 <img> 能解但 createImageBitmap 不稳）；两条都挂必须明确告诉买家，绝不静默
  // 选中图片即刻亮"处理中"——大图解码有耗时，静默=「点了没反应」事故
  const [imgProcessing, setImgProcessing] = useState(false);
  const [pickerBlocked, setPickerBlocked] = useState(false); // 选择器被 WebView 系统层拦截时亮逃生门
  async function pickImage(file: File) {
    setPickerBlocked(false); // 文件到手=选择器没死，收掉逃生门
    setImgError(null);
    if (file.size > 20 * 1024 * 1024) {
      setPendingImage(null);
      setImgError(t("chat.imageTooLarge", { n: 20 }));
      return;
    }
    if (!file.type.startsWith("image/") && !/\.hei[cf]$/i.test(file.name)) {
      setPendingImage(null);
      setImgError(t("chat.imageBadFormat"));
      return;
    }
    setImgProcessing(true);
    try {
      setPendingImage(await compressImageToDataURL(file));
    } catch {
      setPendingImage(null);
      setImgError(t("chat.imageBadFormat"));
    } finally {
      setImgProcessing(false);
    }
  }

  // 附件/拍照共用入口：图片走视觉识别寻源管线；图纸/文档只记文件名（内容不入库不进模型），走 48h 人工核价通道
  function onPickFile(f: File) {
    {
      setPickerBlocked(false);
      if (f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name)) {
        pickImage(f);
      } else {
        setImgError(null);
        if (f.size > 20 * 1024 * 1024) {
          setPendingFile(null);
          setImgError(t("chat.imageTooLarge", { n: 20 }));
        } else {
          setPendingFile(f.name);
        }
      }
    }
  }


  // 语音输入：浏览器原生 SpeechRecognition，不支持的浏览器直接不渲染按钮（不摆死按钮）
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const SpeechRec = typeof window !== "undefined"
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
    : null;
  function toggleVoice() {
    if (!SpeechRec) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SpeechRec();
    rec.lang = ({ zh: "zh-CN", en: "en-US", es: "es-ES", fr: "fr-FR", pt: "pt-BR" } as Record<string, string>)[lang] ?? "en-US";
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      if (txt.trim()) setInput(txt);
    };
    rec.onend = () => setListening(false);
    // 构造器存在≠服务可用（无语音服务/麦克风被拒）：显式提示，不装死按钮
    rec.onerror = () => { setListening(false); setImgError(t("chat.voiceFailed")); };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); setImgError(t("chat.voiceFailed")); }
  }

  // 首页"上传图纸/照片"入口接力：sessionStorage 一次性载荷（图片=压缩 dataURL，图纸=仅文件名）
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("sb.attach");
      if (!raw) return;
      sessionStorage.removeItem("sb.attach");
      const a = JSON.parse(raw);
      if (a?.kind === "image" && typeof a.data === "string") setPendingImage(a.data);
      else if (a?.kind === "doc" && typeof a.name === "string") setPendingFile(a.name);
    } catch { /* 载荷损坏直接忽略，绝不阻塞对话页 */ }
  }, []);

  // 输入卡自适应高度：内容换行自动撑高，封顶 160px（max-h-40）
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  // 只滚动聊天容器本身；scrollIntoView 会带着整页滚动，导致吸顶导航压住内容
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns, chat.isPending]);

  function send(text: string, radarId?: number) {
    const fileMarker = pendingFile ? (lang !== "zh" ? `[Drawing attached: ${pendingFile}]` : `[图纸附件：${pendingFile}]`) : "";
    const base = text.trim() || (pendingImage ? t("chat.defaultImageMsg") : pendingFile ? t("chat.defaultDocMsg") : "");
    const msg = fileMarker ? `${base ? base + " " : ""}${fileMarker}` : base;
    if (!msg || chat.isPending) return;
    const img = pendingImage;
    const history = turns.map((turn) => ({ role: turn.role, content: turn.content }));
    setTurns((ts) => [...ts, { role: "user", content: msg, imageUrl: img ?? undefined }]);
    setInput("");
    setPendingImage(null);
    setPendingFile(null);
    doMutate(msg, history, false, radarId, img ?? undefined);
  }

  // 失败静默重试一次（网络/模型抖动大多是瞬时的）；再失败才诚实告诉买家
  function doMutate(msg: string, history: { role: "user" | "assistant"; content: string }[], isRetry: boolean, radarId?: number, imageData?: string) {
    chat.mutate(
      { message: msg, history, radarId, imageData, locale: lang, threadId: threadId ?? undefined, anonId: anonIdRef.current },
      {
        onSuccess: (res) => {
          const tid = (res as any).threadId;
          if (typeof tid === "number") {
            setThreadId(tid);
            // 会话 ID 落 sessionStorage：点进商品/工厂详情再返回时，对话原样恢复
            // （sessionStorage 跨页内跳转存活，关标签页即清，正好符合"本次逛店"语义）
            try { sessionStorage.setItem("sb.thread", String(tid)); } catch { /* 隐私模式写不进就算了 */ }
          }
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
              echoIntent: (res as any).intent ?? null,
              intentSources: (res as any).intentSources ?? null,
              followUp: (res as any).followUp ?? null,
              manualQuote: !!(res as any).manualQuote,
            },
          ]);
        },
        onError: () => {
          if (!isRetry) {
            setTimeout(() => doMutate(msg, history, true, radarId), 2000);
            return;
          }
          setTurns((ts) => [
            ...ts,
            {
              role: "assistant",
              content: t("chat.errorRetry"),
            },
          ]);
        },
      }
    );
  }

  // M3a：载入历史会话——卡片数据从 payload 快照原样回放（不重新花钱查询）；追问卡不回放（会话已过期，防旧卡误提交）
  async function loadThread(id: number) {
    try {
      const data = await utils.threads.detail.fetch({ threadId: id, anonId: anonIdRef.current });
      if (!data) return;
      setTurns(
        data.messages.map((m: any) => {
          const p = m.payload ?? {};
          return m.role === "user"
            ? { role: "user" as const, content: m.content }
            : {
                role: "assistant" as const,
                content: m.content,
                factories: p.factories?.length ? p.factories : undefined,
                product: p.product ?? null,
                products: p.products?.length ? p.products : undefined,
                linkRef: p.linkContext ?? null,
                quantity: p.intent?.quantity ?? null,
                echoIntent: p.intent ?? null,
                intentSources: p.intentSources ?? null,
                followUp: null,
                manualQuote: !!p.manualQuote,
              };
        }),
      );
      setThreadId(id);
      try { sessionStorage.setItem("sb.thread", String(id)); } catch { /* 同上 */ }
      setShowHistory(false);
    } catch { /* 载入失败就停在当前会话 */ }
  }

  function newChat() {
    setTurns([{ role: "assistant", content: t("chat.greeting") }]);
    setThreadId(null);
    try { sessionStorage.removeItem("sb.thread"); } catch { /* 同上 */ }
    setShowHistory(false);
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
      return;
    }
    // M4a：从「我的询价」/工作台跳入，按 URL thread 参数直接回放该会话
    const tid = params.get("thread");
    if (tid && /^\d+$/.test(tid) && !prefilled.current) {
      prefilled.current = true;
      setParams({}, { replace: true });
      loadThread(Number(tid));
      return;
    }
    // 逛店回程恢复：从商品/工厂详情返回对话页时，按 sessionStorage 里的会话 ID 原样回放，
    // 对话不丢（罗总实测痛点：详情页回来对话没了，像被踢回首页）
    if (!prefilled.current) {
      let saved: string | null = null;
      try { saved = sessionStorage.getItem("sb.thread"); } catch { /* 隐私模式 */ }
      if (saved && /^\d+$/.test(saved)) {
        prefilled.current = true;
        loadThread(Number(saved));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex h-[calc(100dvh-12rem)] max-w-3xl flex-col">
      {/* M3a 会话工具条：历史回放 + 新对话 */}
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="text-xs font-medium text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline"
        >
          {t("history.title")}
        </button>
        <button
          onClick={newChat}
          className="text-xs font-medium text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline"
        >
          {t("history.newChat")}
        </button>
      </div>
      {showHistory && (
        <div className="mb-2 max-h-56 overflow-y-auto rounded-xl border border-[var(--sb-line)] bg-white p-2">
          {!me ? (
            <p className="px-2 py-3 text-center text-xs text-[var(--sb-ink-40)]">
              <Link to="/login?next=%2Fbuyer" className="font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline">{t("nav.signIn")}</Link>
              {" · "}{t("history.loginHint")}
            </p>
          ) : threadsQ.isLoading ? (
            <p className="px-2 py-3 text-center text-xs text-[var(--sb-ink-40)]">…</p>
          ) : !threadsQ.data?.length ? (
            <p className="px-2 py-3 text-center text-xs text-[var(--sb-ink-40)]">{t("history.empty")}</p>
          ) : (
            threadsQ.data.map((th) => (
              <button
                key={th.id}
                onClick={() => loadThread(th.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[var(--sb-brand-soft)] ${th.id === threadId ? "bg-[var(--sb-brand-soft)] font-medium" : ""}`}
              >
                <span className="truncate">{th.title || `#${th.id}`}</span>
                <span className="shrink-0 text-[10px] text-[var(--sb-ink-40)]">
                  {new Date(th.updatedAt).toLocaleDateString(lang !== "zh" ? "en-US" : "zh-CN")}
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {/* 对话区 */}
      <div ref={scrollRef} className="sb-scroll flex-1 space-y-6 overflow-y-auto rounded-[20px] border border-[var(--sb-line)] bg-white p-4 md:p-7">
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--sb-brand)] px-4 py-2.5 text-sm leading-relaxed text-[#eef4f5]">
                {turn.imageUrl && (
                  <img src={turn.imageUrl} alt={t("chat.imageAlt")} className="mb-2 max-h-44 rounded-lg border border-white/20 object-cover" />
                )}
                {turn.content.replace(/^\[(?:补充|跳过补充)\]\s*/, "")}
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
                  {t("chat.aiBuyerTag")}
                </span>
              </div>
              {/* 外链识别卡：贴链接进来的，先摆读到的真实信息 */}
              {turn.linkRef && <LinkRefCard link={turn.linkRef} />}

              <div className="max-w-[94%] border-l-2 border-[var(--sb-brand)]/60 pl-4 text-sm leading-[1.75] whitespace-pre-wrap text-[var(--sb-ink)]">
                {turn.content}
              </div>

              {/* 「我理解的需求」来源行：AI 推断的字段亮明身份（不编数据铁律的界面化） */}
              {turn.intentSources && <IntentEcho sources={turn.intentSources} intent={turn.echoIntent} />}

              {/* 补充问题卡：多题同卡一次提交 / 跳过直寻 */}
              {turn.followUp && (
                <FollowUpCard
                  card={turn.followUp}
                  doneSummary={turn.followUpDone}
                  onSubmit={(msg, doneSummary) => {
                    setTurns((ts) => ts.map((x, xi) => (xi === i ? { ...x, followUpDone: doneSummary } : x)));
                    send(msg);
                  }}
                  onSkip={() => {
                    setTurns((ts) => ts.map((x, xi) => (xi === i ? { ...x, followUpDone: t("chat.followSkippedDone") } : x)));
                    send(t("chat.followSkipMsg"));
                  }}
                />
              )}

              {/* 商品卡：产品优先，到手价入口 */}
              {turn.product && (
                <ProductCard product={turn.product} quantity={turn.quantity} manualQuote={turn.manualQuote} />
              )}

              {/* 搜索商品墙：真实在售货源，出厂价 */}
              {turn.products && turn.products.length > 0 && (
                <ProductStrip products={turn.products} quantity={turn.quantity} manualQuote={turn.manualQuote} />
              )}

              {/* 工厂卡 */}
              {turn.factories && turn.factories.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {turn.factories.map((f) => (
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
                          {/* 未解锁代号按界面语言显示（后端 mask 固定中文模板，外语界面这里换 i18n 版） */}
                          {(f as any).masked ? t("chat.maskedName", { n: String(f.id).padStart(4, "0") }) : f.name}
                        </Link>
                        <span className="shrink-0 rounded bg-[var(--sb-brand-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--sb-brand)]">
                          {f.score}
                        </span>
                      </div>
                      {(f as any).masked && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--sb-ink-40)]">
                          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          {t("chat.maskedHint")}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[var(--sb-ink-40)]">
                        {[f.tier ? t(`home.tierName.${f.tier}`) : null, f.location, f.years ? `${f.years}${t("chat.yearsSuffix")}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {f.matchBasis === "productLinked" && f.linkedOffer ? (
                        /* 有这款在售货：标题直达商品页（罗总 11-12 反馈：推荐厂没产品链接，买家看不到货下不了单） */
                        <Link
                          to={`/products/${f.linkedOffer.offerId}`}
                          className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline"
                        >
                          {t("chat.sellingItem", { title: f.linkedOffer.title.slice(0, 30) })}
                        </Link>
                      ) : (
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--sb-ink-60)]">
                          {f.reason === "严选库在册 · 有这款在售货" ? t("chat.shopVettedShort") || f.reason : f.reason}
                        </p>
                      )}
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
                          {t("chat.rankLine", { cat: f.categoryRank.category, rank: f.categoryRank.rank, total: f.categoryRank.total })}
                        </p>
                      )}
                      {f.matchBasis === "productLinked" && f.linkedOffer && (
                        <Link
                          to={`/products/${f.linkedOffer.offerId}`}
                          className="mt-2 block rounded-md bg-[#fdf6e3] px-2 py-1.5 text-xs font-medium leading-relaxed text-[#92610a] ring-1 ring-[#e9d5a1] transition-shadow hover:shadow-[0_2px_6px_rgba(146,97,10,0.18)]"
                        >
                          {f.linkedOffer.sales > 0
                            ? t("chat.goldBadge", { price: f.linkedOffer.price, sales: f.linkedOffer.sales.toLocaleString() })
                            : t("chat.goldBadgeArchive", { price: f.linkedOffer.price })}
                          <span aria-hidden="true" className="ml-1">→</span>
                        </Link>
                      )}
                      {f.matchBasis === "bucket" && (
                        <p className="mt-2 text-xs font-medium text-[#b45309]">
                          {t("chat.bucketNote")}
                        </p>
                      )}
                      {f.evidence.length > 0 && (
                        <details className="mt-2.5 text-xs">
                          <summary className="cursor-pointer select-none font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline">
                            {t("chat.whyRecommend", { n: f.evidence.length })}
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
                                      {t(`chat.scoreDim.${d.key}`)}
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
                        {f.matchBasis === "productLinked" && f.linkedOffer && (
                          <Link
                            to={`/products/${f.linkedOffer.offerId}`}
                            className="text-xs font-semibold text-[var(--sb-brand)] underline-offset-4 hover:underline"
                          >
                            {t("chat.viewProduct")}
                          </Link>
                        )}
                        <Link
                          to={`/factories/${f.id}`}
                          className="text-xs font-medium text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline"
                        >
                          {t("chat.factoryProfile")}
                        </Link>
                        <Link
                          to="/calculator"
                          className="text-xs font-semibold text-[var(--sb-brand)] underline-offset-4 hover:underline"
                        >
                          {t("chat.calcLink")}
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
          {(t("chat.suggestions") as string[]).map((s) => (
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
        {/* 附件/相机入口：真实 input 全尺寸覆盖在图标上（opacity-0），指尖直接点在文件控件本体——
            htmlFor 转发和 JS click 在部分 WebView 都会被吞，这是兼容性最强的形态（v81） */}
        {imgProcessing && !pendingImage && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--sb-line)] bg-white px-2.5 py-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--sb-brand)] border-t-transparent" />
            <span className="text-xs text-[var(--sb-ink-60)]">{t("chat.processingImage")}</span>
          </div>
        )}
        {pickerBlocked && (
          <div className="mb-2">
            <PickerBlockedHint />
          </div>
        )}
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--sb-line)] bg-white px-2.5 py-2">
            <img src={pendingImage} alt={t("chat.imageAlt")} className="h-10 w-10 rounded-lg border border-[var(--sb-line)] object-cover" />
            <span className="text-xs text-[var(--sb-ink-60)]">{t("chat.imageReady")}</span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="ml-auto shrink-0 rounded-md px-2 py-1 text-xs text-[var(--sb-ink-40)] hover:text-[var(--sb-ink)]"
            >
              {t("chat.remove")}
            </button>
          </div>
        )}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--sb-line)] bg-white px-2.5 py-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--sb-line)] text-[var(--sb-ink-60)]" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 1.5h5.5L12.5 4.5v10H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M9.5 1.5v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--sb-ink-60)]">{t("chat.docReady", { name: pendingFile })}</span>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="ml-auto shrink-0 rounded-md px-2 py-1 text-xs text-[var(--sb-ink-40)] hover:text-[var(--sb-ink)]"
            >
              {t("chat.remove")}
            </button>
          </div>
        )}
        {imgError && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#e9d5a1] bg-[#fdf6e3] px-3 py-2">
            <span className="text-xs leading-relaxed text-[#92610a]">{imgError}</span>
            <button
              type="button"
              onClick={() => setImgError(null)}
              className="ml-auto shrink-0 rounded-md px-2 py-1 text-xs text-[#92610a]/70 hover:text-[#92610a]"
            >
              {t("chat.remove")}
            </button>
          </div>
        )}
        {/* Kimi 风格输入卡：大圆角白卡+柔和投影；上=自适应文本域（Enter 发送/Shift+Enter 换行），
            下一行圆形功能钮（附件/相机/语音）+ 右侧圆形发送钮。看门狗/压缩/粘贴逻辑不变，只换皮 */}
        <div className="rounded-[26px] border border-[var(--sb-line)] bg-white px-2.5 pb-2.5 pt-1 shadow-[0_10px_32px_rgba(11,30,50,0.10)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const f = e.clipboardData?.files?.[0];
              if (f) { e.preventDefault(); onPickFile(f); }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            enterKeyHint="send"
            rows={1}
            placeholder={t("chat.placeholder")}
            className="max-h-40 w-full resize-none bg-transparent px-1.5 py-2.5 text-[15px] leading-relaxed placeholder:text-[var(--sb-ink-40)] focus-visible:outline-none"
          />
          <div className="flex items-center gap-2">
            <AttachButton
              title={t("chat.attachTitle")}
              accept="image/*,application/pdf"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f5f8] text-[var(--sb-ink-60)] transition-colors hover:bg-[#e7edf3] hover:text-[var(--sb-brand)]"
              onFile={onPickFile}
              onChooserBlocked={() => setPickerBlocked(true)}
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m10.5 4.5-4.95 4.95a2 2 0 1 0 2.83 2.83l5.3-5.3a3.5 3.5 0 1 0-4.95-4.95L4.4 6.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" transform="translate(-1 2) scale(0.92)" />
              </svg>
            </AttachButton>
            {/* 拍照寻源：capture=environment 直唤后置相机（桌面回落文件选择） */}
            <AttachButton
              title={t("chat.cameraTitle")}
              accept="image/*"
              capture="environment"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f5f8] text-[var(--sb-ink-60)] transition-colors hover:bg-[#e7edf3] hover:text-[var(--sb-brand)]"
              onFile={onPickFile}
              onChooserBlocked={() => setPickerBlocked(true)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9 4.8A1 1 0 0 1 9.9 4.3h4.2a1 1 0 0 1 .9.5l1.5 2.2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </AttachButton>
            {SpeechRec && (
              <button
                type="button"
                onClick={toggleVoice}
                title={t(listening ? "chat.voiceStop" : "chat.voiceStart")}
                aria-pressed={listening}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                  listening
                    ? "bg-[var(--sb-brand)] text-white"
                    : "bg-[#f2f5f8] text-[var(--sb-ink-60)] hover:bg-[#e7edf3] hover:text-[var(--sb-brand)]"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <div className="flex-1" />
            <button
              type="submit"
              title={t("chat.send")}
              aria-label={t("chat.send")}
              disabled={chat.isPending || (!input.trim() && !pendingImage && !pendingFile)}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                chat.isPending || (!input.trim() && !pendingImage && !pendingFile)
                  ? "bg-[#eef1f4] text-[#aab4bd]"
                  : "bg-[var(--sb-brand)] text-white hover:bg-[var(--sb-brand-hover)]"
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 12.5v-9M3.5 7 8 2.5 12.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
