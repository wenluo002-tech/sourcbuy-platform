import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { DESTINATIONS, CHANNEL_LABEL } from "@contracts/freight";

const DEST_GROUPS = [...new Set(DESTINATIONS.map((d) => d.group))];

export default function Calculator() {
  const [searchParams] = useSearchParams();
  const fromProduct = Number(searchParams.get("price")) > 0;
  const [unitPriceCny, setUnitPriceCny] = useState(
    fromProduct ? searchParams.get("price")! : "8"
  );
  const [quantity, setQuantity] = useState(searchParams.get("qty") ?? "500");
  const [weightKg, setWeightKg] = useState("0.3");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [destinationCode, setDestinationCode] = useState("");
  const [riskTier, setRiskTier] = useState<"A" | "B" | "C">("B");
  const [channel, setChannel] = useState<"express" | "line" | "sea">("line");
  const [submitted, setSubmitted] = useState<null | {
    unitPriceCny: number; quantity: number; weightKg: number;
    dimCm?: { l: number; w: number; h: number };
    destinationCode?: string;
    riskTier: "A" | "B" | "C"; channel: "express" | "line" | "sea";
  }>(null);

  const q = trpc.pricing.landed.useQuery(submitted!, { enabled: !!submitted });

  // 从商品卡带入了出厂价：直接先算一笔，参数可再调
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !fromProduct) return;
    autoRan.current = true;
    setSubmitted({
      unitPriceCny: Number(searchParams.get("price")),
      quantity: Number(searchParams.get("qty")) || 500,
      weightKg: 0.3,
      riskTier: "B",
      channel: "line",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 三个尺寸都填了才传，缺任何一个都按实重计费——不编尺寸
  const dims = () => {
    const l = Number(dimL), w = Number(dimW), h = Number(dimH);
    return l > 0 && w > 0 && h > 0 ? { l, w, h } : undefined;
  };

  const input =
    "w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--sb-brand)]";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">到手价试算</h1>
        <p className="mt-1 text-sm text-stone-500">
          出厂价 + 国内段 + 国际运费 + 关税 + 尾程 + 履约佣金，逐行列示，没有隐藏费用。
        </p>
        {fromProduct && (
          <p className="mt-2 rounded-md bg-[var(--sb-brand-soft)] px-3 py-1.5 text-xs text-[var(--sb-brand)]">
            已从商品卡带入出厂单价{searchParams.get("qty") ? "和数量" : ""}
            ，重量与渠道按常用默认值先试算，可直接调整；未填尺寸按实重计费，抛货请补尺寸。
          </p>
        )}
      </div>

      <form
        className="grid gap-4 rounded-xl border border-stone-200 bg-white p-6 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted({
            unitPriceCny: Number(unitPriceCny),
            quantity: Number(quantity),
            weightKg: Number(weightKg),
            dimCm: dims(),
            destinationCode: destinationCode || undefined,
            riskTier,
            channel,
          });
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">出厂单价（¥ 人民币）</span>
          <input required type="number" step="0.01" min="0.01" value={unitPriceCny}
            onChange={(e) => setUnitPriceCny(e.target.value)} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">采购数量（件）</span>
          <input required type="number" min="1" value={quantity}
            onChange={(e) => setQuantity(e.target.value)} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">单件实重（kg）</span>
          <input required type="number" step="0.01" min="0.01" value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">目的地国家/地区</span>
          <select value={destinationCode} onChange={(e) => setDestinationCode(e.target.value)} className={input}>
            <option value="">未确定（按渠道均价估算）</option>
            {DEST_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {DESTINATIONS.filter((d) => d.group === g).map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.zh} {d.en}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-600">
            单件尺寸 长×宽×高（cm，选填）
            <span className="ml-1 text-xs text-stone-400">
              不填按实重计费；抛货填了更准，体积重与实重取大者
            </span>
          </span>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" step="0.1" min="0" placeholder="长" value={dimL}
              onChange={(e) => setDimL(e.target.value)} className={input} />
            <input type="number" step="0.1" min="0" placeholder="宽" value={dimW}
              onChange={(e) => setDimW(e.target.value)} className={input} />
            <input type="number" step="0.1" min="0" placeholder="高" value={dimH}
              onChange={(e) => setDimH(e.target.value)} className={input} />
          </div>
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">品类风险档</span>
          <select value={riskTier} onChange={(e) => setRiskTier(e.target.value as any)} className={input}>
            <option value="A">A 档 · 低风险标品（服饰/日用/文具）</option>
            <option value="B">B 档 · 中风险（家居/小家电/玩具）</option>
            <option value="C">C 档 · 高风险（电子/化妆品/儿童用品）</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">运输渠道</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className={input}>
            <option value="express">国际快递（体积重 ÷5000）</option>
            <option value="line">空派专线（体积重 ÷6000，欧美日规则有别）</option>
            <option value="sea">海运（体积重 ÷6000）</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-[var(--sb-brand)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--sb-brand-hover)] sm:col-span-2"
        >
          算一笔到手价
        </button>
      </form>

      {q.isFetching && <p className="text-sm text-stone-500">计算中…</p>}
      {q.data && (
        <>
          <div className="rounded-xl border border-stone-200 bg-white p-6">
            <h2 className="mb-4 font-semibold">到手价明细</h2>
            <div className="space-y-2 text-sm">
              {q.data.lines.map((l) => (
                <div key={l.key} className="flex justify-between gap-3 border-b border-stone-100 pb-2">
                  <span className="text-stone-600">{l.label}</span>
                  <span className="shrink-0 font-medium">${l.amount.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 pt-2 text-base font-bold">
                <span>到手价合计</span>
                <span className="shrink-0 text-[var(--sb-brand)]">
                  ${q.data.total.toFixed(2)}
                  <span className="ml-1 text-xs font-normal text-stone-400">
                    ≈ ¥{q.data.totalCny.toLocaleString("zh-CN")}
                  </span>
                </span>
              </div>
              <div className="flex justify-between gap-3 text-sm text-stone-500">
                <span>单件到手价</span>
                <span>
                  ${q.data.perUnit.toFixed(2)} / 件
                  <span className="ml-1 text-xs text-stone-400">
                    ≈ ¥{q.data.perUnitCny.toFixed(2)}
                  </span>
                </span>
              </div>
            </div>
            {q.data.commissionMeta.minFeeApplied && (
              <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">
                本单佣金按比例不足 $50，已按最低收费 $50 计。
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-stone-400">
              费率表版本 {q.data.commissionMeta.ruleVersion} · 佣金基数为出厂价合计（不含运费）·
              参考汇率 {q.data.exchangeRate} ·
              {q.data.chargeableBasis === "actual_unsized"
                ? ` 运费按实重 ${q.data.chargeableWeight} kg 估算（${q.data.volumetricNote}）`
                : ` 运费按计费重 ${q.data.chargeableWeight} kg 估算（${q.data.volumetricNote}）`}
              ；国际运费为渠道均价估算，分区价格矩阵接入后按目的地精确报价；偏远地区附加费以下单时地址核验为准。
            </p>
          </div>

          {/* 老采购渠道建议 */}
          <div className="rounded-xl border border-dashed border-[var(--sb-line,#d6c9b8)] bg-[var(--sb-paper,#f7f3ec)] p-5">
            <p className="text-[11px] font-medium tracking-[0.18em] text-stone-500">
              老采购建议 · CHANNEL ADVICE
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              {q.data.channelAdvice.isCurrentRecommended ? (
                <>
                  这票货我建议走<strong className="text-[var(--sb-brand)]">{q.data.channelAdvice.recommendedLabel}</strong>，你选的就是它——{q.data.channelAdvice.reason}。
                </>
              ) : (
                <>
                  这票货我更建议走<strong className="text-[var(--sb-brand)]">{q.data.channelAdvice.recommendedLabel}</strong>——{q.data.channelAdvice.reason}。你当前选的是{CHANNEL_LABEL[submitted!.channel]}，到手价对比看下表，换不换你定。
                </>
              )}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead>
                  <tr className="text-left text-stone-500">
                    <th className="pb-1.5 font-medium">渠道</th>
                    <th className="pb-1.5 font-medium">计费重</th>
                    <th className="pb-1.5 font-medium">国际运费</th>
                    <th className="pb-1.5 font-medium">到手价</th>
                    <th className="pb-1.5 font-medium">参考时效</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.channelAdvice.compare.map((c) => (
                    <tr
                      key={c.channel}
                      className={`border-t border-stone-200/70 ${
                        c.channel === q.data!.channelAdvice.recommended
                          ? "font-medium text-[var(--sb-brand)]"
                          : "text-stone-600"
                      }`}
                    >
                      <td className="py-1.5">
                        {c.label}
                        {c.channel === q.data!.channelAdvice.recommended && " ✓"}
                      </td>
                      <td className="py-1.5">{c.chargeableKg} kg</td>
                      <td className="py-1.5">${c.freight.toFixed(2)}</td>
                      <td className="py-1.5">${c.total.toFixed(2)}</td>
                      <td className="py-1.5">{c.transit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
