import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";
import { FX_SETTLEMENT } from "@contracts/fx";
import { DESTINATIONS } from "@contracts/freight";
import { useT } from "@/i18n";

const REF_RATE = FX_SETTLEMENT;

function fmtSalesNum(n: number, lang: string = "zh"): string {
  if (lang !== "zh") return n.toLocaleString("en-US");
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  return n.toLocaleString();
}

const input =
  "w-full rounded-lg border border-[var(--sb-line)] bg-white px-3 py-2 text-sm focus:border-[var(--sb-brand)] focus:outline-none";
const label = "mb-1 block text-[11px] font-medium text-[var(--sb-ink-40)]";

/* 履约链路：佣金买到的四段服务 */
function FulfillmentChain({ dispatchNote }: { dispatchNote: string | null }) {
  const { t } = useT();
  const chain = t("product.chain") as { t: string; d: string }[];
  const steps = chain.map((c, i) => (i === 0 && dispatchNote ? { ...c, d: dispatchNote } : c));
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.t} className="rounded-xl border border-[var(--sb-line)] bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--sb-brand)]">0{i + 1}</p>
          <p className="mt-1.5 text-sm font-semibold">{s.t}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--sb-ink-60)]">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}

/* 加载等待态：直连源头工厂核价核库存的过程话术（不提"翻译"，符合老采购人设）+ 转圈动画 + 副话术轮换。
   外语首次访问要实时翻译数据层文本，等待 5–15s——绝不能白屏干等。 */
function ProductLoading() {
  const { t } = useT();
  const [subIdx, setSubIdx] = useState(0);
  useEffect(() => {
    const tm = setInterval(() => setSubIdx((i) => (i + 1) % 3), 2400);
    return () => clearInterval(tm);
  }, []);
  const subs = [t("product.loadingSub1"), t("product.loadingSub2"), t("product.loadingSub3")];
  return (
    <div className="mx-auto max-w-5xl py-4">
      <div className="flex items-center gap-3.5 rounded-xl border border-[var(--sb-line)] bg-[var(--sb-paper)] px-4 py-3.5">
        <span className="sb-spinner shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("product.loadingMain")}</p>
          <p key={subIdx} className="mt-0.5 text-xs text-[var(--sb-ink-60)]" style={{ animation: "sb-rise .45s ease both" }}>
            {subs[subIdx]}
          </p>
        </div>
      </div>
      <div className="mt-6 grid animate-pulse gap-8 md:grid-cols-2">
        <div className="aspect-square rounded-2xl bg-[var(--sb-paper)]" />
        <div className="space-y-3">
          <div className="h-6 w-3/4 rounded bg-[var(--sb-paper)]" />
          <div className="h-10 w-1/2 rounded bg-[var(--sb-paper)]" />
          <div className="h-24 rounded bg-[var(--sb-paper)]" />
        </div>
      </div>
    </div>
  );
}

export default function ProductDetail() {
  const { offerId = "" } = useParams();
  const { lang, t } = useT();
  const { me } = useAuth();
  const nav = useNavigate();
  const inquireMut = trpc.orders.create.useMutation({
    onSuccess: (r) => nav(`/orders/${r.orderId}`),
  });
  const q = trpc.products.detailV2.useQuery({ offerId, locale: lang }, { retry: false });
  const offer = q.data?.offer ?? null;
  const factory = q.data?.factory ?? null;

  // SKU 规格名 >8 个时后端异步分批填翻译缓存（绝不让买家为几百个规格名干等）——
  // 前端检测到规格名仍含中文时每 4s 静默重取一次，缓存填到哪批就换上哪批；中文消完或满 20 次（80s）即停。
  const skuRefetchTried = useRef(0);
  useEffect(() => {
    skuRefetchTried.current = 0; // 换商品/换语言时重计
  }, [offerId, lang]);
  useEffect(() => {
    if (!offer || lang === "zh" || skuRefetchTried.current >= 20) return;
    const hasZhSku = offer.skus?.some((s: { specText?: string }) => s.specText && /[\u4e00-\u9fff]/.test(s.specText));
    if (!hasZhSku) return;
    skuRefetchTried.current += 1;
    const tm = setTimeout(() => q.refetch(), 4000);
    return () => clearTimeout(tm);
  }, [offer, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const [imgIdx, setImgIdx] = useState(0);
  const [skuImg, setSkuImg] = useState<string | null>(null); // 选规格时切到该规格的颜色图
  const touchStartX = useRef<number | null>(null); // 主图左右滑动手势（移动端原相册习惯）
  const [skuIdx, setSkuIdx] = useState(0);
  const [qty, setQty] = useState("");
  const [dest, setDest] = useState("");
  const [riskTier, setRiskTier] = useState<"A" | "B" | "C">("B");
  const [calcKey, setCalcKey] = useState(0);

  const sku = offer?.skus?.[skuIdx] ?? null;
  const tiers = useMemo(() => [...(offer?.priceTiers ?? [])].sort((a, b) => a.minQty - b.minQty), [offer]);
  const qtyN = Math.max(0, parseInt(qty, 10) || 0);
  // 计价优先级：单 SKU 价（若该 listing 支持）→ 按数量命中阶梯档 → 最低价
  const tierPriceForQty = qtyN > 0 ? [...tiers].reverse().find((t) => qtyN >= t.minQty)?.price : undefined;
  const unitPrice = sku?.price ?? tierPriceForQty ?? tiers[0]?.price ?? offer?.priceMin ?? null;
  const weightKg = sku?.weightKg ?? offer?.unitWeightKg ?? null;

  const calcInput = useMemo(() => {
    if (!calcKey || !unitPrice || !weightKg || qtyN <= 0) return null;
    return { unitPriceCny: unitPrice, quantity: qtyN, weightKg, riskTier, channel: "auto", destinationCode: dest || undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey]);
  const landed = trpc.pricing.landed.useQuery(calcInput!, { enabled: !!calcInput });

  if (q.isLoading) {
    return <ProductLoading />;
  }

  if (!offer) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-lg font-semibold">{t("product.notFoundTitle")}</p>
        <p className="mt-2 text-sm text-[var(--sb-ink-60)]">{t("product.notFoundBody")}</p>
        <Link to="/buyer" className="sb-pill mt-6 inline-block px-6 py-2.5 text-sm">
          {t("product.notFoundCta")}
        </Link>
      </div>
    );
  }

  const mainImg = skuImg ?? offer.images[imgIdx] ?? null;
  const hasRange = tiers.length > 1 && tiers[0].price !== tiers[tiers.length - 1].price;
  // 主价格：SKU 有价显示 SKU 价；多档阶梯显示区间（低–高）；否则显示单档价
  const rangeLo = hasRange ? Math.min(...tiers.map((t) => t.price)) : null;
  const rangeHi = hasRange ? Math.max(...tiers.map((t) => t.price)) : null;
  const priceMain = sku?.price != null ? `¥${sku.price}` : hasRange ? `¥${rangeLo}–${rangeHi}` : offer.priceMin != null ? `¥${offer.priceMin}` : "—";
  const priceUsd = (sku?.price ?? (!hasRange ? offer.priceMin : null)) != null ? ((sku?.price ?? offer.priceMin!) / REF_RATE).toFixed(2) : null;

  // 「为什么挑中它」：只用真实数据，一条都编不出来就不渲染整块
  const maxStock = offer.skus.reduce((m, s) => Math.max(m, s.stock ?? 0), 0);
  const why: string[] = [];
  if (offer.sales != null && offer.sales > 0) why.push(t("product.whySales", { n: fmtSalesNum(offer.sales, lang) }));
  if (hasRange) {
    const drop = 1 - tiers[tiers.length - 1].price / tiers[0].price;
    if (drop >= 0.05) why.push(t("product.whyTierDrop", { n: tiers[tiers.length - 1].minQty, p: tiers[tiers.length - 1].price, pct: (drop * 100).toFixed(0) }));
  }
  if (offer.skus.length > 1) why.push(t("product.whySkuStock", { n: offer.skus.length, stock: maxStock > 0 ? t("product.whySkuStockDeep", { n: fmtSalesNum(maxStock, lang) }) : "" }));
  if (offer.dispatchHours) why.push(t("product.whyDispatch", { n: offer.dispatchHours }));
  if (factory) why.push(t("product.whyFactory", { tier: factory.tier ? t("product.whyFactoryTier", { tier: t(`home.tierName.${factory.tier}`) }) : "", score: factory.score ?? "—" }));

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <Link to="/buyer" className="text-xs font-medium text-[var(--sb-ink-40)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline">
        {t("product.back")}
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        {/* 图廊：主图支持左右滑动切换（移动端），指示点显示当前位置 */}
        <div className="min-w-0">
          <div
            className="relative overflow-hidden rounded-2xl border border-[var(--sb-line)] bg-white"
            style={{ touchAction: "pan-y" }} /* 纵向滚动不受影响，横向手势归图廊 */
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              const startX = touchStartX.current;
              touchStartX.current = null;
              if (startX == null || offer.images.length <= 1) return;
              const dx = e.changedTouches[0].clientX - startX;
              if (Math.abs(dx) < 40) return; // 防误触：位移不足不翻页
              setSkuImg(null); // 滑动时离开规格图，回到图廊序列
              const n = offer.images.length;
              setImgIdx((i) => (dx < 0 ? (i + 1) % n : (i - 1 + n) % n));
            }}
          >
            {mainImg ? (
              <img
                src={mainImg}
                alt={offer.title}
                referrerPolicy="no-referrer"
                draggable={false}
                className="aspect-square w-full object-cover select-none"
              />
            ) : (
              <div className="aspect-square w-full bg-[var(--sb-paper)]" />
            )}
            {offer.images.length > 1 && !skuImg && (
              <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
                {offer.images.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full ${i === imgIdx ? "bg-[var(--sb-brand)]" : "bg-black/20"}`}
                  />
                ))}
              </div>
            )}
          </div>
          {offer.images.length > 1 && (
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
              {offer.images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setImgIdx(i);
                    setSkuImg(null); // 手动点缩略图时回到图廊图
                  }}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                    i === imgIdx && !skuImg ? "border-[var(--sb-brand)]" : "border-transparent"
                  }`}
                >
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 信息栏 */}
        <div className="min-w-0">
          <h1 className="text-lg leading-snug font-bold break-words md:text-xl">{offer.title}</h1>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--sb-ink-60)]">
            {offer.moq != null && <span>{t("product.moq", { n: offer.moq })}</span>}
            {offer.sales != null && offer.sales > 0 && <span>{t("product.soldN", { n: fmtSalesNum(offer.sales, lang) })}</span>}
            {offer.dispatchHours != null && <span>{t("product.dispatchH", { n: offer.dispatchHours })}</span>}
          </div>

          {/* 价格 */}
          <div className="mt-4 rounded-xl border border-[var(--sb-line)] bg-[var(--sb-paper)] px-4 py-3.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="sb-num text-3xl font-bold tracking-tight text-[var(--sb-navy)]">{priceMain}</span>
              <span className="text-xs text-[var(--sb-ink-40)]">{t("product.perUnitExw")}</span>
              {priceUsd && <span className="sb-num text-sm text-[var(--sb-ink-40)]">≈ US${priceUsd}</span>}
            </div>
            {hasRange && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {tiers.map((tp, i) => (
                  <span
                    key={i}
                    className={`rounded-md border px-2 py-1 text-[11px] tabular-nums ${
                      qtyN > 0 && qtyN >= tp.minQty && (i === tiers.length - 1 || qtyN < tiers[i + 1].minQty)
                        ? "border-[var(--sb-brand)] bg-[var(--sb-brand-soft)] font-medium text-[var(--sb-brand)]"
                        : "border-[var(--sb-line)] bg-white text-[var(--sb-ink-60)]"
                    }`}
                  >
                    {t("product.tierPrice", { n: tp.minQty, p: tp.price })}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--sb-ink-40)]">
              {t("product.fxNote", { rate: REF_RATE })}
            </p>
          </div>

          {/* SKU 选择 */}
          {offer.skus.length > 0 && (
            <div className="mt-4">
              <p className={label}>
                {t("product.skuLabel", { n: offer.skus.length, stock: sku?.stock != null ? t("product.skuStock", { n: sku.stock.toLocaleString() }) : "" })}
              </p>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {offer.skus.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSkuIdx(i);
                      if (s.image) setSkuImg(s.image); // 切规格联动颜色图
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                      i === skuIdx
                        ? "border-[var(--sb-brand)] bg-[var(--sb-brand-soft)] font-medium text-[var(--sb-brand)]"
                        : "border-[var(--sb-line)] bg-white text-[var(--sb-ink-60)] hover:border-[var(--sb-brand)]/50"
                    }`}
                  >
                    {s.specText.replace(/>/g, " · ")}
                    {s.price != null && <span className="ml-1.5 tabular-nums">¥{s.price}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 到手价快算 */}
          <div className="mt-4 rounded-xl border border-[var(--sb-line)] bg-white p-4">
            <p className={label}>{t("product.quickCalc")}{weightKg != null ? t("product.quickCalcWeight", { w: weightKg }) : ""}</p>
            {weightKg == null ? (
              <p className="text-xs leading-relaxed text-[var(--sb-ink-60)]">
                {t("product.noWeight")}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                  <label>
                    <span className={label}>{t("product.qtyLabel")}</span>
                    <input
                      value={qty}
                      onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder={offer.moq ? `≥${offer.moq}` : t("product.qtyPh")}
                      className={`${input} sb-num`}
                    />
                  </label>
                  <label className="col-span-2 md:col-span-1">
                    <span className={label}>{t("product.destLabel")}</span>
                    <select value={dest} onChange={(e) => setDest(e.target.value)} className={input}>
                      <option value="">{t("product.destGeneric")}</option>
                      {DESTINATIONS.map((d) => (
                        <option key={d.code} value={d.code}>
                          {lang !== "zh" ? d.en : d.zh}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2 md:col-span-1">
                    <span className={label}>{t("product.riskLabel")}</span>
                    <select value={riskTier} onChange={(e) => setRiskTier(e.target.value as any)} className={input}>
                      <option value="A">{t("product.riskA")}</option>
                      <option value="B">{t("product.riskB")}</option>
                      <option value="C">{t("product.riskC")}</option>
                    </select>
                  </label>
                  <div className="col-span-2 flex items-end md:col-span-1">
                    <button
                      onClick={() => qtyN > 0 && setCalcKey((k) => k + 1)}
                      disabled={qtyN <= 0 || landed.isFetching}
                      className="sb-pill w-full px-4 py-2 text-sm disabled:opacity-40"
                    >
                      {landed.isFetching ? t("product.calculating") : t("product.calcBtn")}
                    </button>
                  </div>
                </div>
                {landed.data && (
                  <div className="mt-3 rounded-lg bg-[var(--sb-navy)] px-4 py-3 text-[#eef4f5]">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">{t("product.perUnitLanded")}{dest ? "" : t("product.genericSuffix")}</p>
                        <p className="sb-num text-2xl font-bold">US${landed.data.perUnit}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">{t("product.totalLot", { n: qtyN })}</p>
                        <p className="sb-num text-lg font-semibold">US${landed.data.total.toLocaleString()}</p>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] opacity-70">
                      {landed.data.realChannel
                        ? `${landed.data.realChannel.name} · ${landed.data.realChannel.transitNote}`
                        : t("product.genericChannel")}
                      {" · "}{landed.data.commissionMeta ? t("product.commissionLabel", { rate: `${(landed.data.commissionMeta.rate * 100).toFixed(1)}%` }) : ""}
                    </p>
                  </div>
                )}
                {landed.error && (
                  <p className="mt-2 text-xs text-[var(--sb-ink-60)]">{t("product.calcErrorPrefix")}{landed.error.message}{t("product.calcErrorSuffix")}</p>
                )}
              </>
            )}
          </div>

          {/* CTA */}
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={inquireMut.isPending}
              onClick={() => {
                if (!me) { nav(`/login?next=/products/${offer.offerId}`); return; }
                inquireMut.mutate({
                  offerId: String(offer.offerId),
                  productTitle: offer.title,
                  productImage: offer.images?.[0] ?? undefined,
                  quantity: qtyN || undefined,
                });
              }}
              className="sb-pill bg-[var(--sb-brand)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--sb-brand-hover)] disabled:opacity-40"
            >
              {t("orders.ctaInquire")}
            </button>
            <Link
              to={`/buyer?prefill=${encodeURIComponent(t("product.ctaFollowMsg", { id: offer.offerId, title: offer.title.slice(0, 30) }))}`}
              className="sb-pill px-5 py-2.5 text-sm"
            >
              {t("product.ctaFollow")}
            </Link>
            <Link
              to={`/calculator?price=${unitPrice ?? ""}${qtyN ? `&qty=${qtyN}` : ""}${weightKg ? `&weight=${weightKg}` : ""}`}
              className="rounded-full border border-[var(--sb-line)] px-5 py-2.5 text-sm font-medium text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
            >
              {t("product.ctaFullCalc")}
            </Link>
          </div>
        </div>
      </div>

      {/* 为什么挑中它 */}
      {why.length > 0 && (
        <section className="mt-10">
          <p className="sb-eyebrow">{t("product.whyKicker")} · {t("product.whyTitle")}</p>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {why.map((w, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-xl border border-[var(--sb-line)] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--sb-ink-60)]">
                <span className="mt-0.5 shrink-0 text-[var(--sb-brand)]">✓</span>
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 工厂背书 */}
      <section className="mt-10">
        <p className="sb-eyebrow">{t("product.behindKicker")} · {t("product.behindTitle")}</p>
        {factory ? (
          <div className="mt-3 rounded-2xl border border-[var(--sb-line)] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link to={`/factories/${factory.id}`} className="text-base font-semibold hover:text-[var(--sb-brand)]">
                  {(factory as any).masked ? t("chat.maskedName", { n: String(factory.id).padStart(4, "0") }) : factory.name}
                </Link>
                <p className="mt-1 text-xs text-[var(--sb-ink-40)]">
                  {[factory.tier ? t("product.factoryMetaTier", { tier: t(`home.tierName.${factory.tier}`) }) : null, factory.location, factory.years ? t("product.yearsOld", { n: factory.years }) : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="sb-num text-2xl font-bold text-[var(--sb-brand)]">{factory.score}</p>
                <p className="text-[10px] text-[var(--sb-ink-40)]">{t("factoryDetail.scoreLabel")}</p>
              </div>
            </div>
            <p className="mt-3 border-t border-[var(--sb-line)] pt-3 text-xs leading-relaxed text-[var(--sb-ink-60)]">
              {t("product.vettedNote")}
              <Link to={`/factories/${factory.id}`} className="ml-1 font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline">
                {t("product.viewProfile")}
              </Link>
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--sb-line)] bg-[var(--sb-paper)] p-5">
            <p className="text-sm font-semibold">{t("product.notVettedTitle")}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--sb-ink-60)]">
              {t("product.notVettedBody")}
            </p>
          </div>
        )}
      </section>

      {/* 履约链路 */}
      <section className="mt-10">
        <p className="sb-eyebrow">{t("product.shipKicker")} · {t("product.shipTitle")}</p>
        <h2 className="mt-2 text-lg font-bold">{t("product.shipH2")}</h2>
        <div className="mt-4">
          <FulfillmentChain dispatchNote={offer.dispatchNote} />
        </div>
      </section>

      <p className="mt-8 text-[10px] leading-relaxed text-[var(--sb-ink-40)]">
        {t("product.footnote")}
      </p>
    </div>
  );
}
