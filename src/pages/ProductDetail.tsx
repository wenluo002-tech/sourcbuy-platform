import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { FX_SETTLEMENT } from "@contracts/fx";
import { DESTINATIONS } from "@contracts/freight";

const REF_RATE = FX_SETTLEMENT;

function fmtSales(n: number | null): string | null {
  if (n == null || n <= 0) return null;
  if (n >= 10000) return `已售 ${(n / 10000).toFixed(1).replace(/\.0$/, "")} 万`;
  return `已售 ${n.toLocaleString()}`;
}

const input =
  "w-full rounded-lg border border-[var(--sb-line)] bg-white px-3 py-2 text-sm focus:border-[var(--sb-brand)] focus:outline-none";
const label = "mb-1 block text-[11px] font-medium text-[var(--sb-ink-40)]";

/* 运输链路：把履约过程摆在买家面前——这是我们的服务费买到的东西 */
function FulfillmentChain({ dispatchNote }: { dispatchNote: string | null }) {
  const steps = [
    { t: "工厂出货", d: dispatchNote ?? "按工厂承诺时效发货" },
    { t: "集货仓二次质检", d: "到仓开箱核验，货不对板当场拦截" },
    { t: "国际运输", d: "按试算方案走真实渠道，全程轨迹可查" },
    { t: "清关派送", d: "出口申报、清关、尾程派送到门" },
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.t} className="rounded-xl border border-[var(--sb-line)] bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--sb-brand)]">
            0{i + 1}
          </p>
          <p className="mt-1.5 text-sm font-semibold">{s.t}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--sb-ink-60)]">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}

export default function ProductDetail() {
  const { offerId = "" } = useParams();
  const q = trpc.products.detailV2.useQuery({ offerId }, { retry: false });
  const offer = q.data?.offer ?? null;
  const factory = q.data?.factory ?? null;

  const [imgIdx, setImgIdx] = useState(0);
  const [skuIdx, setSkuIdx] = useState(0);
  const [qty, setQty] = useState("");
  const [dest, setDest] = useState("");
  const [riskTier, setRiskTier] = useState<"A" | "B" | "C">("B");
  const [calcKey, setCalcKey] = useState(0); // 0 = 未触发

  const sku = offer?.skus?.[skuIdx] ?? null;
  const unitPrice = sku?.price ?? offer?.priceTiers?.[0]?.price ?? offer?.priceMin ?? null;
  const weightKg = sku?.weightKg ?? offer?.unitWeightKg ?? null;
  const qtyN = Math.max(0, parseInt(qty, 10) || 0);

  const calcInput = useMemo(() => {
    if (!calcKey || !unitPrice || !weightKg || qtyN <= 0) return null;
    return {
      unitPriceCny: unitPrice,
      quantity: qtyN,
      weightKg,
      riskTier,
      channel: "auto",
      destinationCode: dest || undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey]);
  const landed = trpc.pricing.landed.useQuery(calcInput!, { enabled: !!calcInput });

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-5xl animate-pulse py-4">
        <div className="h-4 w-32 rounded bg-[var(--sb-paper)]" />
        <div className="mt-6 grid gap-8 md:grid-cols-2">
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

  if (!offer) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-lg font-semibold">这个商品没拿到</p>
        <p className="mt-2 text-sm text-[var(--sb-ink-60)]">
          可能已下架，或货号有误。把链接发给我，我再帮你查一次。
        </p>
        <Link to="/buyer" className="sb-pill mt-6 inline-block px-6 py-2.5 text-sm">
          去问老采购 →
        </Link>
      </div>
    );
  }

  const tiers = [...(offer.priceTiers ?? [])].sort((a, b) => a.minQty - b.minQty);
  const sales = fmtSales(offer.sales);
  const weightNote =
    weightKg != null
      ? `单件申报约 ${weightKg} kg（已按体积重交叉校验）`
      : "单件重量待核实，试算时需手动填";

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <Link
        to="/buyer"
        className="text-xs font-medium text-[var(--sb-ink-40)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline"
      >
        ← 返回对话
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        {/* 图廊 */}
        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-[var(--sb-line)] bg-white">
            {offer.images[imgIdx] ? (
              <img
                src={offer.images[imgIdx]}
                alt={offer.title}
                referrerPolicy="no-referrer"
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="aspect-square w-full bg-[var(--sb-paper)]" />
            )}
          </div>
          {offer.images.length > 1 && (
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
              {offer.images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setImgIdx(i)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                    i === imgIdx ? "border-[var(--sb-brand)]" : "border-transparent"
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
            {offer.moq != null && <span>起订 ≥ {offer.moq}</span>}
            {sales && <span>{sales}</span>}
            {offer.dispatchNote && <span>{offer.dispatchNote}</span>}
            <span>{weightNote}</span>
          </div>

          {/* 价格 */}
          <div className="mt-4 rounded-xl border border-[var(--sb-line)] bg-[var(--sb-paper)] px-4 py-3.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="sb-num text-3xl font-bold tracking-tight text-[var(--sb-navy)]">
                ¥{unitPrice ?? "—"}
              </span>
              <span className="text-xs text-[var(--sb-ink-40)]">/ 件 · 出厂价</span>
              {unitPrice != null && (
                <span className="sb-num text-sm text-[var(--sb-ink-40)]">
                  ≈ US${(unitPrice / REF_RATE).toFixed(2)}
                </span>
              )}
            </div>
            {tiers.length > 1 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {tiers.map((t, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-[var(--sb-line)] bg-white px-2 py-1 text-[11px] tabular-nums text-[var(--sb-ink-60)]"
                  >
                    ≥{t.minQty} 件 · ¥{t.price}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--sb-ink-40)]">
              按结汇汇率 {REF_RATE} 折算（当日牌价 − 0.3）；到手价另含运费、关税与履约佣金
            </p>
          </div>

          {/* SKU 选择 */}
          {offer.skus.length > 0 && (
            <div className="mt-4">
              <p className={label}>
                规格（{offer.skus.length} 个{sku?.stock != null ? ` · 当前规格可售 ${sku.stock.toLocaleString()}` : ""}）
              </p>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {offer.skus.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setSkuIdx(i)}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                      i === skuIdx
                        ? "border-[var(--sb-brand)] bg-[var(--sb-brand-soft)] font-medium text-[var(--sb-brand)]"
                        : "border-[var(--sb-line)] bg-white text-[var(--sb-ink-60)] hover:border-[var(--sb-brand)]/50"
                    }`}
                  >
                    {s.specText}
                    <span className="ml-1.5 tabular-nums">¥{s.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 到手价快算 */}
          <div className="mt-4 rounded-xl border border-[var(--sb-line)] bg-white p-4">
            <p className={label}>到手价快算（用该规格真实重量）</p>
            {weightKg == null ? (
              <p className="text-xs leading-relaxed text-[var(--sb-ink-60)]">
                这款的重量上游没给可靠数据，我不瞎填——点下方「完整试算」手动输入重量再算。
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                  <label>
                    <span className={label}>数量（件）</span>
                    <input
                      value={qty}
                      onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder={offer.moq ? `≥${offer.moq}` : "如 500"}
                      className={`${input} sb-num`}
                    />
                  </label>
                  <label className="col-span-2 md:col-span-1">
                    <span className={label}>目的地</span>
                    <select value={dest} onChange={(e) => setDest(e.target.value)} className={input}>
                      <option value="">通用估算</option>
                      {DESTINATIONS.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.zh}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2 md:col-span-1">
                    <span className={label}>品类风险档</span>
                    <select value={riskTier} onChange={(e) => setRiskTier(e.target.value as any)} className={input}>
                      <option value="A">A 档 · 低风险标品</option>
                      <option value="B">B 档 · 中风险</option>
                      <option value="C">C 档 · 高风险</option>
                    </select>
                  </label>
                  <div className="col-span-2 flex items-end md:col-span-1">
                    <button
                      onClick={() => qtyN > 0 && setCalcKey((k) => k + 1)}
                      disabled={qtyN <= 0 || landed.isFetching}
                      className="sb-pill w-full px-4 py-2 text-sm disabled:opacity-40"
                    >
                      {landed.isFetching ? "计算中…" : "试算"}
                    </button>
                  </div>
                </div>
                {landed.data && (
                  <div className="mt-3 rounded-lg bg-[var(--sb-navy)] px-4 py-3 text-[#eef4f5]">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">
                          到手单价{dest ? "" : "（通用估算）"}
                        </p>
                        <p className="sb-num text-2xl font-bold">US${landed.data.perUnit}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">整票 {qtyN} 件</p>
                        <p className="sb-num text-lg font-semibold">US${landed.data.total.toLocaleString()}</p>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] opacity-70">
                      {landed.data.realChannel
                        ? `${landed.data.realChannel.name} · ${landed.data.realChannel.transitNote}`
                        : "通用估算渠道，选目的地后走真实价卡"}
                      {" · "}佣金 {landed.data.commissionMeta ? `${(landed.data.commissionMeta.rate * 100).toFixed(1)}%` : ""}
                    </p>
                  </div>
                )}
                {landed.error && (
                  <p className="mt-2 text-xs text-[var(--sb-ink-60)]">
                    试算没跑通：{landed.error.message}。可以走完整试算页逐项填。
                  </p>
                )}
              </>
            )}
          </div>

          {/* CTA */}
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              to={`/buyer?prefill=${encodeURIComponent(`帮我看看这款货（货号 ${offer.offerId}）：${offer.title.slice(0, 30)}`)}`}
              className="sb-pill px-5 py-2.5 text-sm"
            >
              让老采购跟进这款 →
            </Link>
            <Link
              to={`/calculator?price=${unitPrice ?? ""}${qtyN ? `&qty=${qtyN}` : ""}${weightKg ? `&weight=${weightKg}` : ""}`}
              className="rounded-full border border-[var(--sb-line)] px-5 py-2.5 text-sm font-medium text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
            >
              完整试算（可选渠道/附加费）
            </Link>
          </div>
        </div>
      </div>

      {/* 工厂背书 */}
      <section className="mt-10">
        <p className="sb-eyebrow">Behind This Listing · 背后的厂</p>
        {factory ? (
          <div className="mt-3 rounded-2xl border border-[var(--sb-line)] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link
                  to={`/factories/${factory.id}`}
                  className="text-base font-semibold hover:text-[var(--sb-brand)]"
                >
                  {factory.name}
                </Link>
                <p className="mt-1 text-xs text-[var(--sb-ink-40)]">
                  {[factory.tier ? `${factory.tier}标严选` : null, factory.location, factory.years ? `${factory.years} 年老厂` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="sb-num text-2xl font-bold text-[var(--sb-brand)]">{factory.score}</p>
                <p className="text-[10px] text-[var(--sb-ink-40)]">严选评分</p>
              </div>
            </div>
            <p className="mt-3 border-t border-[var(--sb-line)] pt-3 text-xs leading-relaxed text-[var(--sb-ink-60)]">
              这家就在我们严选库里，底细验过——评分七维加权、算法公开，花钱买不到名次。
              <Link to={`/factories/${factory.id}`} className="ml-1 font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline">
                看工厂档案 →
              </Link>
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--sb-line)] bg-[var(--sb-paper)] p-5">
            <p className="text-sm font-semibold">这家供应商不在我们的严选库里</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--sb-ink-60)]">
              不在库里不等于不能买，但底细我们还没验过。看中这款就发给我——我去查它的工商信息、经营年限和履约记录，必要时安排验厂，别裸下单。
            </p>
          </div>
        )}
      </section>

      {/* 运输链路 */}
      <section className="mt-10">
        <p className="sb-eyebrow">How It Ships · 履约链路</p>
        <h2 className="mt-2 text-lg font-bold">你的佣金买到的是这四段</h2>
        <div className="mt-4">
          <FulfillmentChain dispatchNote={offer.dispatchNote} />
        </div>
      </section>

      <p className="mt-8 text-[10px] text-[var(--sb-ink-40)]">
        商品数据核验于 {new Date(offer.fetchedAt).toLocaleString("zh-CN", { hour12: false })}
        {offer.source === "cache" ? "（缓存，24 小时内实时核验过一次）" : "（实时核验）"} · 价格为工厂原始报价，下单前以实际议价为准
      </p>
    </div>
  );
}
