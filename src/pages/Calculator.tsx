import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { DESTINATIONS } from "@contracts/freight";
import { FX_LABEL } from "@contracts/fx";

const DEST_GROUPS = [...new Set(DESTINATIONS.map((d) => d.group))];

type Submitted = {
  unitPriceCny: number; quantity: number; weightKg: number;
  dimCm?: { l: number; w: number; h: number };
  destinationCode?: string;
  riskTier: "A" | "B" | "C"; channel: string; // "auto" = 老采购自动挑渠道
  zip?: string; caRegion?: string; cargoType?: string; residential?: boolean;
};

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
  const [channel, setChannel] = useState<string>("auto");
  const [proMode, setProMode] = useState(false);
  const [zip, setZip] = useState("");
  const [caRegion, setCaRegion] = useState("");
  const [cargoType, setCargoType] = useState("general");
  const [residential, setResidential] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);

  const q = trpc.pricing.landed.useQuery(submitted!, { enabled: !!submitted });

  // 目的地 → 真实渠道清单（2026-10-15 价卡），决定邮编/交仓区域等字段是否出现
  const channelsQ = trpc.pricing.channels.useQuery(
    { destinationCode: destinationCode || undefined },
    { staleTime: 5 * 60_000 }
  );
  const realChannels = channelsQ.data?.channels ?? [];
  const hasReal = realChannels.length > 0;
  const selCh = realChannels.find((c) => c.id === channel);
  // 自动模式下按目的地判断必填项；行家模式按所选渠道判断
  const needsZip =
    hasReal &&
    (destinationCode === "US" || destinationCode === "AU") &&
    (!proMode || channel === "auto" || !!selCh?.needsZip);
  const needsCaRegion =
    hasReal &&
    destinationCode === "CA" &&
    (!proMode || channel === "auto" || !!selCh?.needsCaRegion);
  const caRegionOptions = channelsQ.data
    ? [...new Set(Object.values(channelsQ.data.caRegions).flat())]
    : [];

  // 目的地切换：回到自动模式，清空分区字段
  const prevDest = useRef(destinationCode);
  useEffect(() => {
    if (!channelsQ.data || prevDest.current === destinationCode) return;
    prevDest.current = destinationCode;
    setChannel("auto");
    setZip("");
    setCaRegion("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelsQ.data, destinationCode]);

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
      channel: "auto",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 三个尺寸都填了才传，缺任何一个都按实重计费——不编尺寸
  const dims = () => {
    const l = Number(dimL), w = Number(dimW), h = Number(dimH);
    return l > 0 && w > 0 && h > 0 ? { l, w, h } : undefined;
  };

  const buildSubmit = (ch: string): Submitted => ({
    unitPriceCny: Number(unitPriceCny),
    quantity: Number(quantity),
    weightKg: Number(weightKg),
    dimCm: dims(),
    destinationCode: destinationCode || undefined,
    riskTier,
    channel: ch,
    zip: needsZip && zip.trim() ? zip.trim() : undefined,
    caRegion: needsCaRegion && caRegion ? caRegion : undefined,
    cargoType: hasReal ? cargoType : undefined,
    residential: hasReal ? residential : undefined,
  });

  // 方案卡片「改用此方案」：记住选择并重算
  const switchTo = (ch: string) => {
    setChannel(ch);
    setSubmitted(buildSubmit(ch));
  };

  // —— 表单控件样式：1px 细边、6px 圆角、焦点品牌蓝 ——
  const input =
    "w-full rounded-md border border-black/10 bg-white px-3 py-2.5 text-sm transition-colors duration-150 placeholder:text-black/30 hover:border-black/20 focus-visible:outline-2 focus-visible:outline-[var(--sb-brand)]";
  const label = "mb-1.5 block text-xs font-medium tracking-wide text-black/55";

  // —— 方案卡片数据 ——
  const compare = q.data?.channelAdvice.compare ?? [];
  const budget = compare.length
    ? compare.reduce((a, b) => (a.total <= b.total ? a : b))
    : null;
  const airs = compare.filter((c) => c.mode === "air");
  const fastest = airs.length
    ? airs.reduce((a, b) => (a.total <= b.total ? a : b))
    : null;
  const seas = compare
    .filter((c) => c.mode === "sea")
    .sort((a, b) => a.total - b.total);
  const currentChannelId =
    q.data?.realChannel?.id ?? (submitted && submitted.channel !== "auto" ? submitted.channel : null);
  const isAuto = submitted?.channel === "auto";

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-4">
      {/* 页头 */}
      <div>
        <span className="sb-eyebrow">Landed Cost Calculator</span>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">到手价试算</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-black/55">
          出厂价、国内段、国际运费、关税、尾程、履约佣金，逐行列示，没有隐藏费用。
        </p>
        {fromProduct && (
          <p className="sb-note mt-3 rounded-md px-3 py-2 text-xs leading-relaxed">
            已从商品卡带入出厂单价{searchParams.get("qty") ? "和数量" : ""}
            ，重量按常用默认值先试算，可直接调整；未填尺寸按实重计费，抛货请补尺寸。
          </p>
        )}
      </div>

      {/* 参数表单 */}
      <form
        className="rounded-xl border border-black/10 bg-white p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(buildSubmit(channel));
        }}
      >
        <span className="sb-eyebrow !text-black/45">货物与目的地 · Shipment</span>
        <div className="mt-5 grid gap-x-5 gap-y-6 sm:grid-cols-2">
          <label>
            <span className={label}>出厂单价（¥ 人民币）</span>
            <input required type="number" step="0.01" min="0.01" value={unitPriceCny}
              onChange={(e) => setUnitPriceCny(e.target.value)} className={`${input} sb-num`} />
          </label>
          <label>
            <span className={label}>采购数量（件）</span>
            <input required type="number" min="1" value={quantity}
              onChange={(e) => setQuantity(e.target.value)} className={`${input} sb-num`} />
          </label>
          <label>
            <span className={label}>单件实重（kg）</span>
            <input required type="number" step="0.01" min="0.01" value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)} className={`${input} sb-num`} />
          </label>
          <label>
            <span className={label}>目的地国家/地区</span>
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
          <div className="sm:col-span-2">
            <span className={label}>
              单件尺寸 长×宽×高（cm，选填）
              <span className="ml-1 font-normal text-black/35">
                不填按实重计费；抛货填了更准
              </span>
            </span>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" step="0.1" min="0" placeholder="长" value={dimL}
                onChange={(e) => setDimL(e.target.value)} className={`${input} sb-num`} />
              <input type="number" step="0.1" min="0" placeholder="宽" value={dimW}
                onChange={(e) => setDimW(e.target.value)} className={`${input} sb-num`} />
              <input type="number" step="0.1" min="0" placeholder="高" value={dimH}
                onChange={(e) => setDimH(e.target.value)} className={`${input} sb-num`} />
            </div>
          </div>
          <label>
            <span className={label}>品类风险档</span>
            <select value={riskTier} onChange={(e) => setRiskTier(e.target.value as any)} className={input}>
              <option value="A">A 档 · 低风险标品（服饰/日用/文具）</option>
              <option value="B">B 档 · 中风险（家居/小家电/玩具）</option>
              <option value="C">C 档 · 高风险（电子/化妆品/儿童用品）</option>
            </select>
          </label>
          {needsZip && (
            <label>
              <span className={label}>
                收件邮编
                <span className="ml-1 font-normal text-black/35">
                  分区报价必需{destinationCode === "AU" ? "（4 位，如 2000）" : "（5 位，如 90001）"}
                </span>
              </span>
              <input required value={zip} onChange={(e) => setZip(e.target.value)}
                placeholder={destinationCode === "AU" ? "2000" : "90001"} className={`${input} sb-num`} />
            </label>
          )}
          {needsCaRegion && (
            <label>
              <span className={label}>派送区域（加拿大海运按区域定价）</span>
              <select required value={caRegion} onChange={(e) => setCaRegion(e.target.value)} className={input}>
                <option value="">请选择交仓/派送区域</option>
                {caRegionOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
          )}
          {hasReal && (
            <>
              <label>
                <span className={label}>
                  货物属性
                  <span className="ml-1 font-normal text-black/35">影响渠道可用性与附加费</span>
                </span>
                <select value={cargoType} onChange={(e) => setCargoType(e.target.value)} className={input}>
                  {channelsQ.data?.cargoTypes.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2.5 self-end pb-2.5 text-sm text-black/60">
                <input type="checkbox" checked={residential}
                  onChange={(e) => setResidential(e.target.checked)}
                  className="h-4 w-4 accent-[var(--sb-brand)]" />
                收件地址是私人住宅（可能有住宅派送附加费）
              </label>
            </>
          )}
        </div>

        {/* 渠道不用买家挑：默认自动推荐；行家可展开手选 */}
        {hasReal && !proMode && (
          <p className="mt-6 rounded-md bg-[var(--sb-brand-soft)] px-3.5 py-2.5 text-xs leading-relaxed text-black/60">
            渠道不用你挑——我按协议价把该国的每条渠道都算一遍，直接给你
            <strong className="text-[var(--sb-brand)]">最省钱</strong>和
            <strong className="text-[var(--sb-brand)]">最快</strong>两个方案。
            {channelsQ.data?.priceVersion && <span className="text-black/35">（{channelsQ.data.priceVersion}）</span>}
            <button type="button" onClick={() => setProMode(true)}
              className="ml-1.5 font-medium text-[var(--sb-brand)] underline underline-offset-2">
              我是行家，自己选渠道
            </button>
          </p>
        )}
        {proMode && (
          <label className="mt-6 block">
            <span className={label}>
              运输渠道（行家模式）
              <button type="button" onClick={() => { setProMode(false); setChannel("auto"); }}
                className="ml-2 font-medium text-[var(--sb-brand)] underline underline-offset-2">
                回到自动推荐
              </button>
            </span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={input}>
              <option value="auto">自动推荐（按到手价替你挑）</option>
              {realChannels.length > 0 && (
                <optgroup label={`真实协议价（${channelsQ.data?.priceVersion}）`}>
                  {realChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.ddp ? "（包税）" : ""} · {c.transitNote}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="通用估算（非协议价）">
                <option value="express">国际快递（体积重 ÷5000）</option>
                <option value="line">空派专线（体积重 ÷6000，欧美日规则有别）</option>
                <option value="sea">海运（体积重 ÷6000）</option>
              </optgroup>
            </select>
            {selCh && selCh.minShipmentKg > 0 && (
              <span className="mt-1.5 block text-xs text-black/40">
                该渠道整票最低计费 {selCh.minShipmentKg} kg
              </span>
            )}
          </label>
        )}

        <button
          type="submit"
          className="sb-pill mt-7 flex w-full items-center justify-center gap-2 bg-[var(--sb-brand)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--sb-brand-hover)]"
        >
          算一笔到手价
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 8h11M9 3.5 14 8l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </form>

      {q.isFetching && <p className="text-sm text-black/45">计算中…</p>}
      {q.error && (
        <div className="sb-note rounded-xl p-5 text-sm">
          <p className="font-semibold">
            {q.error.message.includes("人工单询") ? "这票货需要人工核价" : "这票货现在报不了价"}
          </p>
          <p className="mt-1.5 leading-relaxed">{q.error.message}</p>
          <p className="mt-2 text-xs opacity-75">
            可以调整货物属性或目的地再试，或把需求发给采购顾问，我们按协议价人工核给你。
          </p>
        </div>
      )}

      {q.data && (
        <>
          {/* 方案卡片：买家只看这两张 */}
          {budget && (
            <section>
              <span className="sb-eyebrow !text-black/45">两种走法 · Two Ways to Ship</span>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {/* 性价比卡：深海军蓝，全场视觉焦点 */}
                <div
                  className="sb-rise rounded-xl p-6 text-white"
                  style={{ background: "var(--sb-navy)", "--sb-delay": "0ms" } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sb-sky)]">
                      性价比之选
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-white/85">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--sb-sky)]" />
                      老采购推荐
                    </span>
                  </div>
                  <p className="mt-4 font-semibold leading-snug">{budget.label}</p>
                  <p className="mt-1 text-xs text-[var(--sb-navy-ink)]">
                    {budget.mode === "sea" ? "海运" : "空运"}{budget.speedTag ? ` · ${budget.speedTag}` : ""} · {budget.transit}
                  </p>
                  <p className="sb-num mt-5 text-[40px] font-bold leading-none tracking-tight">
                    ${budget.total.toFixed(2)}
                  </p>
                  <p className="mt-2 text-xs text-[var(--sb-navy-ink)]">
                    到手价合计 · 国际运费 <span className="sb-num">${budget.freight.toFixed(2)}</span> · 计费重 <span className="sb-num">{budget.chargeableKg} kg</span>
                  </p>
                  {/* 海运子方案：普船/快船互换 */}
                  {budget.mode === "sea" && seas.length > 1 && (
                    <div className="mt-4 border-t border-[var(--sb-navy-line)]">
                      {seas.filter((s) => s.channel !== budget.channel).map((s) => (
                        <button key={s.channel} type="button" onClick={() => switchTo(s.channel)}
                          className="flex w-full items-baseline justify-between gap-2 border-b border-[var(--sb-navy-line)] px-1 py-2 text-left text-xs transition-colors duration-150 hover:bg-white/5">
                          <span className="text-white/75">
                            {s.speedTag ?? "海运"} · {s.label.replace(/^美国海派 · /, "")}
                          </span>
                          <span className="sb-num shrink-0 text-white/90">
                            ${s.total.toFixed(2)}
                            <span className="ml-1 text-[var(--sb-navy-ink)]">
                              {s.total > budget.total ? `+${(s.total - budget.total).toFixed(0)}` : `−${(budget.total - s.total).toFixed(0)}`}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-5">
                    {currentChannelId === budget.channel ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--sb-sky)]">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="m3 8.5 3.2 3L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        当前方案{isAuto ? "（我替你挑的）" : ""}
                      </span>
                    ) : (
                      <button type="button" onClick={() => switchTo(budget.channel)}
                        className="sb-pill bg-white px-4 py-2 text-xs font-semibold text-[var(--sb-navy)] hover:bg-white/90">
                        改用此方案
                      </button>
                    )}
                  </div>
                </div>

                {/* 时效卡：白底细边，与推荐卡形成明暗对照 */}
                {fastest && fastest.channel !== budget.channel ? (
                  <div
                    className="sb-rise rounded-xl border border-black/10 bg-white p-6"
                    style={{ "--sb-delay": "80ms" } as React.CSSProperties}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">
                      时效最快
                    </span>
                    <p className="mt-4 font-semibold leading-snug">{fastest.label}</p>
                    <p className="mt-1 text-xs text-black/45">空运 · {fastest.transit}</p>
                    <p className="sb-num mt-5 text-[40px] font-bold leading-none tracking-tight text-[var(--sb-brand)]">
                      ${fastest.total.toFixed(2)}
                    </p>
                    <p className="mt-2 text-xs text-black/45">
                      比省钱方案贵 <span className="sb-num">${(fastest.total - budget.total).toFixed(0)}</span> ·
                      计费重 <span className="sb-num">{fastest.chargeableKg} kg</span>
                    </p>
                    <p className="mt-4 text-xs leading-relaxed text-black/50">
                      赶交期、补断货选它；不急就走左边，省下的都是利润。
                    </p>
                    <div className="mt-4">
                      {currentChannelId === fastest.channel ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--sb-brand)]">
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="m3 8.5 3.2 3L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          当前方案
                        </span>
                      ) : (
                        <button type="button" onClick={() => switchTo(fastest.channel)}
                          className="sb-pill border border-[var(--sb-brand)] px-4 py-2 text-xs font-semibold text-[var(--sb-brand)] hover:bg-[var(--sb-brand-soft)]">
                          改用此方案
                        </button>
                      )}
                    </div>
                  </div>
                ) : budget.mode === "air" ? (
                  <div
                    className="sb-rise rounded-xl border border-dashed border-black/15 bg-[var(--sb-paper)] p-6"
                    style={{ "--sb-delay": "80ms" } as React.CSSProperties}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">
                      老采购点评
                    </span>
                    <p className="mt-4 text-sm leading-relaxed text-black/70">
                      这票货量级小，空运又省又快，就是它了。等量起来（百公斤级以上），海运能把到手价再压一截，到时候来找我重算。
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          )}

          {/* 逐行明细：收据式排版 */}
          <section
            className="sb-rise rounded-xl border border-black/10 bg-white p-6 sm:p-8"
            style={{ "--sb-delay": "160ms" } as React.CSSProperties}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="sb-eyebrow !text-black/45">逐行明细 · Breakdown</span>
              {q.data.realChannel && (
                <span className="text-right text-[11px] leading-relaxed text-black/40">
                  {q.data.realChannel.name} · {q.data.realChannel.ddp ? "DDP 包税" : "不含税"} · {q.data.realChannel.priceVersion}
                </span>
              )}
            </div>
            <div className="mt-5">
              {q.data.lines.map((l) => (
                <div key={l.key} className="flex items-baseline justify-between gap-4 border-b border-black/[0.06] py-2.5">
                  <span className="text-sm text-black/60">{l.label}</span>
                  <span className="sb-num shrink-0 text-sm font-medium">${l.amount.toFixed(2)}</span>
                </div>
              ))}
              <div className="mt-4 flex items-baseline justify-between gap-4 border-t-2 border-black/80 pt-4">
                <span className="text-sm font-semibold">到手价合计</span>
                <span className="sb-num shrink-0 text-[28px] font-bold leading-none tracking-tight text-[var(--sb-brand)]">
                  ${q.data.total.toFixed(2)}
                </span>
              </div>
              <div className="mt-1.5">
                <span className="sb-num text-xs text-black/45">
                  ≈ ¥{q.data.totalCny.toLocaleString("zh-CN")} · 单件 ${q.data.perUnit.toFixed(2)}（≈ ¥{q.data.perUnitCny.toFixed(2)}）
                </span>
              </div>
            </div>
            {q.data.freightWarnings && q.data.freightWarnings.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {q.data.freightWarnings.map((w, i) => (
                  <p key={i} className="sb-note rounded-md p-2.5 text-xs leading-relaxed">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}
            {q.data.commissionMeta.minFeeApplied && (
              <p className="sb-note mt-3 rounded-md p-2.5 text-xs">
                本单佣金按比例不足 $50，已按最低收费 $50 计。
              </p>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-black/40">
              费率表 {q.data.commissionMeta.ruleVersion} · 佣金基数为出厂价合计（不含运费）·
              {FX_LABEL} ·
              {q.data.chargeableBasis === "real_channel"
                ? ` 运费按协议价卡精确报价（${q.data.volumetricNote}），附加费以实际出货核验为准`
                : q.data.chargeableBasis === "actual_unsized"
                  ? ` 运费按实重 ${q.data.chargeableWeight} kg 估算（${q.data.volumetricNote}）`
                  : ` 运费按计费重 ${q.data.chargeableWeight} kg 估算（${q.data.volumetricNote}）`}
              {q.data.chargeableBasis !== "real_channel" &&
                "；美国/加拿大/墨西哥/澳大利亚已接入分区协议价，选这些目的地可精确报价。"}
            </p>
          </section>

          {/* 全渠道对比（备查，不用选） */}
          {compare.length > 1 && (
            <details
              className="sb-rise group rounded-xl border border-dashed border-black/15 bg-[var(--sb-paper)] p-5"
              style={{ "--sb-delay": "240ms" } as React.CSSProperties}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">
                <span>
                  全部渠道对比 · 备查（{compare.length} 条已报价
                  {q.data.channelAdvice.unavailable?.length
                    ? `，${q.data.channelAdvice.unavailable.length} 条不可用`
                    : ""}
                  ）
                </span>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                  className="transition-transform duration-150 group-open:rotate-180">
                  <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </summary>
              {q.data.channelAdvice.reason && (
                <p className="mt-3 text-sm leading-relaxed text-black/65">
                  {q.data.channelAdvice.reason}。
                </p>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-black/40">
                      <th className="pb-2 font-medium">渠道</th>
                      <th className="pb-2 font-medium">计费重</th>
                      <th className="pb-2 font-medium">国际运费</th>
                      <th className="pb-2 font-medium">到手价</th>
                      <th className="pb-2 font-medium">参考时效</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compare.map((c) => (
                      <tr
                        key={c.channel}
                        className={`border-t border-black/[0.07] ${
                          c.channel === q.data!.channelAdvice.recommended
                            ? "font-medium text-[var(--sb-brand)]"
                            : "text-black/60"
                        }`}
                      >
                        <td className="py-2">{c.label}{c.channel === q.data!.channelAdvice.recommended && " ✓"}</td>
                        <td className="sb-num py-2">{c.chargeableKg} kg</td>
                        <td className="sb-num py-2">${c.freight.toFixed(2)}</td>
                        <td className="sb-num py-2">${c.total.toFixed(2)}</td>
                        <td className="py-2">{c.transit}</td>
                      </tr>
                    ))}
                    {q.data.channelAdvice.unavailable?.map((u) => (
                      <tr key={u.label} className="border-t border-black/[0.07] text-black/35">
                        <td className="py-2">{u.label}</td>
                        <td className="py-2" colSpan={4}>未入选：{u.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
