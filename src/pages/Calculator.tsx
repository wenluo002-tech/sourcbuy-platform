import { useState } from "react";
import { trpc } from "@/providers/trpc";

export default function Calculator() {
  const [unitPriceCny, setUnitPriceCny] = useState("8");
  const [quantity, setQuantity] = useState("500");
  const [weightKg, setWeightKg] = useState("0.3");
  const [riskTier, setRiskTier] = useState<"A" | "B" | "C">("B");
  const [channel, setChannel] = useState<"express" | "line" | "sea">("line");
  const [submitted, setSubmitted] = useState<null | {
    unitPriceCny: number; quantity: number; weightKg: number;
    riskTier: "A" | "B" | "C"; channel: "express" | "line" | "sea";
  }>(null);

  const q = trpc.pricing.landed.useQuery(submitted!, { enabled: !!submitted });

  const input =
    "w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-700";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">到手价试算</h1>
        <p className="mt-1 text-sm text-stone-500">
          出厂价 + 国内段 + 国际运费 + 关税 + 尾程 + 履约佣金，逐行列示，没有隐藏费用。
        </p>
      </div>

      <form
        className="grid gap-4 rounded-xl border border-stone-200 bg-white p-6 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted({
            unitPriceCny: Number(unitPriceCny),
            quantity: Number(quantity),
            weightKg: Number(weightKg),
            riskTier,
            channel,
          });
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">出厂单价（¥）</span>
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
          <span className="mb-1 block text-stone-600">品类风险档</span>
          <select value={riskTier} onChange={(e) => setRiskTier(e.target.value as any)} className={input}>
            <option value="A">A 档 · 低风险标品（服饰/日用/文具）</option>
            <option value="B">B 档 · 中风险（家居/小家电/玩具）</option>
            <option value="C">C 档 · 高风险（电子/化妆品/儿童用品）</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-600">运输渠道</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className={input}>
            <option value="express">国际快递（体积重 ÷5000）</option>
            <option value="line">空派专线（体积重 ÷6000）</option>
            <option value="sea">海运（体积重 ÷6000）</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 sm:col-span-2"
        >
          算一笔到手价
        </button>
      </form>

      {q.isFetching && <p className="text-sm text-stone-500">计算中…</p>}
      {q.data && (
        <div className="rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 font-semibold">到手价明细</h2>
          <div className="space-y-2 text-sm">
            {q.data.lines.map((l) => (
              <div key={l.key} className="flex justify-between border-b border-stone-100 pb-2">
                <span className="text-stone-600">{l.label}</span>
                <span className="font-medium">${l.amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 text-base font-bold">
              <span>到手价合计</span>
              <span className="text-emerald-800">${q.data.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-stone-500">
              <span>单件到手价</span>
              <span>${q.data.perUnit.toFixed(2)} / 件</span>
            </div>
          </div>
          {q.data.commissionMeta.minFeeApplied && (
            <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">
              本单佣金按比例不足 $50，已按最低收费 $50 计。
            </p>
          )}
          <p className="mt-3 text-xs text-stone-400">
            费率表版本 {q.data.commissionMeta.ruleVersion} · 佣金基数为出厂价合计（不含运费）·
            运费按计费重 {q.data.chargeableWeight} kg 估算
          </p>
        </div>
      )}
    </div>
  );
}
