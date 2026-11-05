import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { DESTINATIONS } from "@contracts/freight";
import { FX_LABEL } from "@contracts/fx";
import { useT } from "@/i18n";

const DEST_GROUPS = [...new Set(DESTINATIONS.map((d) => d.group))];

type Submitted = {
  unitPriceCny: number; quantity: number; weightKg: number;
  dimCm?: { l: number; w: number; h: number };
  destinationCode?: string;
  riskTier: "A" | "B" | "C"; channel: string; // "auto" = 老采购自动挑渠道
  zip?: string; caRegion?: string; cargoType?: string; residential?: boolean;
};

export default function Calculator() {
  const { lang, t } = useT();
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
  const [formError, setFormError] = useState("");

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
      weightKg: Number(searchParams.get("weight")) || 0.3, // 详情页带真实重量；无则 0.3 仅作表单预填，结果页可见可改
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
        <span className="sb-eyebrow">{t("calc.eyebrow")}</span>
        <h1 className="sb-display mt-4 text-3xl tracking-tight sm:text-[40px]">{t("calc.h1")}</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-black/55">
          {t("calc.sub")}
        </p>
        {fromProduct && (
          <p className="sb-note mt-3 rounded-md px-3 py-2 text-xs leading-relaxed">
            {t("calc.fromProduct", { qty: searchParams.get("qty") ? t("calc.fromProductQty") : "" })}
          </p>
        )}
      </div>

      {/* 参数表单 */}
      <form
        className="rounded-xl border border-black/10 bg-white p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (needsZip && !zip.trim()) {
            setFormError(
              destinationCode === "AU" ? t("calc.zipErrAu") : t("calc.zipErrUs")
            );
            return;
          }
          if (needsCaRegion && !caRegion) {
            setFormError(t("calc.caErr"));
            return;
          }
          setFormError("");
          setSubmitted(buildSubmit(channel));
        }}
      >
        <span className="sb-eyebrow !text-black/45">{t("calc.sectionShipment")}</span>
        <div className="mt-5 grid gap-x-5 gap-y-6 sm:grid-cols-2">
          <label>
            <span className={label}>{t("calc.unitPrice")}</span>
            <input required type="number" step="0.01" min="0.01" value={unitPriceCny}
              onChange={(e) => setUnitPriceCny(e.target.value)} className={`${input} sb-num`} />
          </label>
          <label>
            <span className={label}>{t("calc.quantity")}</span>
            <input required type="number" min="1" value={quantity}
              onChange={(e) => setQuantity(e.target.value)} className={`${input} sb-num`} />
          </label>
          <label>
            <span className={label}>{t("calc.weight")}</span>
            <input required type="number" step="0.01" min="0.01" value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)} className={`${input} sb-num`} />
          </label>
          <label>
            <span className={label}>{t("calc.dest")}</span>
            <select value={destinationCode} onChange={(e) => setDestinationCode(e.target.value)} className={input}>
              <option value="">{t("calc.destUndecided")}</option>
              {DEST_GROUPS.map((g) => (
                <optgroup key={g} label={t(`destGroup.${g}`)}>
                  {DESTINATIONS.filter((d) => d.group === g).map((d) => (
                    <option key={d.code} value={d.code}>
                      {lang === "en" ? d.en : `${d.zh} ${d.en}`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <span className={label}>
              {t("calc.dims")}
              <span className="ml-1 font-normal text-black/35">
                {t("calc.dimsHint")}
              </span>
            </span>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" step="0.1" min="0" placeholder={t("calc.dimL")} value={dimL}
                onChange={(e) => setDimL(e.target.value)} className={`${input} sb-num`} />
              <input type="number" step="0.1" min="0" placeholder={t("calc.dimW")} value={dimW}
                onChange={(e) => setDimW(e.target.value)} className={`${input} sb-num`} />
              <input type="number" step="0.1" min="0" placeholder={t("calc.dimH")} value={dimH}
                onChange={(e) => setDimH(e.target.value)} className={`${input} sb-num`} />
            </div>
          </div>
          <label>
            <span className={label}>{t("calc.risk")}</span>
            <select value={riskTier} onChange={(e) => setRiskTier(e.target.value as any)} className={input}>
              <option value="A">{t("calc.riskA")}</option>
              <option value="B">{t("calc.riskB")}</option>
              <option value="C">{t("calc.riskC")}</option>
            </select>
          </label>
          {needsZip && (
            <label>
              <span className={label}>
                {t("calc.zipLabel")}
                <span className="ml-1 font-normal text-black/35">
                  {t(destinationCode === "AU" ? "calc.zipHintAu" : "calc.zipHintUs")}
                </span>
              </span>
              <input value={zip} onChange={(e) => setZip(e.target.value)}
                placeholder={destinationCode === "AU" ? "2000" : "90001"} className={`${input} sb-num`} />
            </label>
          )}
          {needsCaRegion && (
            <label>
              <span className={label}>{t("calc.caLabel")}</span>
              <select value={caRegion} onChange={(e) => setCaRegion(e.target.value)} className={input}>
                <option value="">{t("calc.caSelect")}</option>
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
                  {t("calc.cargoType")}
                  <span className="ml-1 font-normal text-black/35">{t("calc.cargoHint")}</span>
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
                {t("calc.residential")}
              </label>
            </>
          )}
        </div>

        {/* 渠道不用买家挑：默认自动推荐；行家可展开手选 */}
        {hasReal && !proMode && (
          <p className="mt-6 rounded-md bg-[var(--sb-brand-soft)] px-3.5 py-2.5 text-xs leading-relaxed text-black/60">
            {t("calc.autoNotePre")}
            <strong className="text-[var(--sb-brand)]">{t("calc.autoNoteCheapest")}</strong>{t("calc.autoNoteMid")}
            <strong className="text-[var(--sb-brand)]">{t("calc.autoNoteFastest")}</strong>{t("calc.autoNotePost")}
            {channelsQ.data?.priceVersion && <span className="text-black/35">（{channelsQ.data.priceVersion}）</span>}
            <button type="button" onClick={() => setProMode(true)}
              className="ml-1.5 font-medium text-[var(--sb-brand)] underline underline-offset-2">
              {t("calc.proEntry")}
            </button>
          </p>
        )}
        {proMode && (
          <label className="mt-6 block">
            <span className={label}>
              {t("calc.proLabel")}
              <button type="button" onClick={() => { setProMode(false); setChannel("auto"); }}
                className="ml-2 font-medium text-[var(--sb-brand)] underline underline-offset-2">
                {t("calc.proExit")}
              </button>
            </span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={input}>
              <option value="auto">{t("calc.autoOption")}</option>
              {realChannels.length > 0 && (
                <optgroup label={t("calc.realGroup", { v: channelsQ.data?.priceVersion ?? "" })}>
                  {realChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.ddp ? t("calc.ddpTag") : ""} · {c.transitNote}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t("calc.genericGroup")}>
                <option value="express">{t("calc.chExpress")}</option>
                <option value="line">{t("calc.chLine")}</option>
                <option value="sea">{t("calc.chSea")}</option>
              </optgroup>
            </select>
            {selCh && selCh.minShipmentKg > 0 && (
              <span className="mt-1.5 block text-xs text-black/40">
                {t("calc.minKg", { n: selCh.minShipmentKg })}
              </span>
            )}
          </label>
        )}

        {formError && (
          <p className="mt-6 rounded-md border border-[var(--sb-warn)]/30 bg-[var(--sb-warn-bg)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--sb-warn)]">
            {formError}
          </p>
        )}

        <button
          type="submit"
          className="sb-pill mt-7 flex w-full items-center justify-center gap-2 bg-[var(--sb-brand)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--sb-brand-hover)]"
        >
          {t("calc.submit")}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 8h11M9 3.5 14 8l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </form>

      {q.isFetching && <p className="text-sm text-black/45">{t("calc.calculating")}</p>}
      {q.error && (
        <div className="sb-note rounded-xl p-5 text-sm">
          <p className="font-semibold">
            {q.error.message.includes("人工单询") ? t("calc.errManual") : t("calc.errGeneric")}
          </p>
          <p className="mt-1.5 leading-relaxed">{q.error.message}</p>
          <p className="mt-2 text-xs opacity-75">
            {t("calc.errHint")}
          </p>
        </div>
      )}

      {q.data && (
        <>
          {/* 方案卡片：买家只看这两张 */}
          {budget && (
            <section>
              <span className="sb-eyebrow !text-black/45">{t("calc.twoWays")}</span>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {/* 性价比卡：深海军蓝，全场视觉焦点 */}
                <div
                  className="sb-rise rounded-xl p-6 text-white"
                  style={{ background: "var(--sb-navy)", "--sb-delay": "0ms" } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sb-sky)]">
                      {t("calc.budgetTag")}
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-white/85">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--sb-sky)]" />
                      {t("calc.recommended")}
                    </span>
                  </div>
                  <p className="mt-4 font-semibold leading-snug">{budget.label}</p>
                  <p className="mt-1 text-xs text-[var(--sb-navy-ink)]">
                    {budget.mode === "sea" ? t("calc.modeSea") : t("calc.modeAir")}{budget.speedTag ? ` · ${budget.speedTag}` : ""} · {budget.transit}
                  </p>
                  <p className="sb-num mt-5 text-[40px] font-bold leading-none tracking-tight">
                    ${budget.total.toFixed(2)}
                  </p>
                  <p className="mt-2 text-xs text-[var(--sb-navy-ink)]">
                    {t("calc.landedTotal")} · {t("calc.intlFreight")} <span className="sb-num">${budget.freight.toFixed(2)}</span> · {t("calc.chargeable")} <span className="sb-num">{budget.chargeableKg} kg</span>
                  </p>
                  {/* 海运子方案：普船/快船互换 */}
                  {budget.mode === "sea" && seas.length > 1 && (
                    <div className="mt-4 border-t border-[var(--sb-navy-line)]">
                      {seas.filter((s) => s.channel !== budget.channel).map((s) => (
                        <button key={s.channel} type="button" onClick={() => switchTo(s.channel)}
                          className="flex w-full items-baseline justify-between gap-2 border-b border-[var(--sb-navy-line)] px-1 py-2 text-left text-xs transition-colors duration-150 hover:bg-white/5">
                          <span className="text-white/75">
                            {s.speedTag ?? t("calc.modeSea")} · {s.label.replace(/^美国海派 · /, "")}
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
                        {t("calc.currentPlan")}{isAuto ? t("calc.currentPlanAuto") : ""}
                      </span>
                    ) : (
                      <button type="button" onClick={() => switchTo(budget.channel)}
                        className="sb-pill bg-white px-4 py-2 text-xs font-semibold text-[var(--sb-navy)] hover:bg-white/90">
                        {t("calc.switchPlan")}
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
                      {t("calc.fastestTag")}
                    </span>
                    <p className="mt-4 font-semibold leading-snug">{fastest.label}</p>
                    <p className="mt-1 text-xs text-black/45">{t("calc.modeAir")} · {fastest.transit}</p>
                    <p className="sb-num mt-5 text-[40px] font-bold leading-none tracking-tight text-[var(--sb-brand)]">
                      ${fastest.total.toFixed(2)}
                    </p>
                    <p className="mt-2 text-xs text-black/45">
                      {t("calc.fasterPre")} <span className="sb-num">${(fastest.total - budget.total).toFixed(0)}</span>{t("calc.fasterPost")} ·
                      {t("calc.chargeable")} <span className="sb-num">{fastest.chargeableKg} kg</span>
                    </p>
                    <p className="mt-4 text-xs leading-relaxed text-black/50">
                      {t("calc.fasterWhy")}
                    </p>
                    <div className="mt-4">
                      {currentChannelId === fastest.channel ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--sb-brand)]">
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="m3 8.5 3.2 3L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          {t("calc.currentPlan")}
                        </span>
                      ) : (
                        <button type="button" onClick={() => switchTo(fastest.channel)}
                          className="sb-pill border border-[var(--sb-brand)] px-4 py-2 text-xs font-semibold text-[var(--sb-brand)] hover:bg-[var(--sb-brand-soft)]">
                          {t("calc.switchPlan")}
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
                      {t("calc.buyerComment")}
                    </span>
                    <p className="mt-4 text-sm leading-relaxed text-black/70">
                      {t("calc.buyerCommentAir")}
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
              <span className="sb-eyebrow !text-black/45">{t("calc.breakdown")}</span>
              {q.data.realChannel && (
                <span className="text-right text-[11px] leading-relaxed text-black/40">
                  {q.data.realChannel.name} · {q.data.realChannel.ddp ? t("calc.ddpYes") : t("calc.ddpNo")} · {q.data.realChannel.priceVersion}
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
                <span className="text-sm font-semibold">{t("calc.grandTotal")}</span>
                <span className="sb-num shrink-0 text-[28px] font-bold leading-none tracking-tight text-[var(--sb-brand)]">
                  ${q.data.total.toFixed(2)}
                </span>
              </div>
              <div className="mt-1.5">
                <span className="sb-num text-xs text-black/45">
                  {t("calc.approxLine", {
                    total: q.data.totalCny.toLocaleString(lang === "en" ? "en-US" : "zh-CN"),
                    per: q.data.perUnit.toFixed(2),
                    perCny: q.data.perUnitCny.toFixed(2),
                  })}
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
                {t("calc.minFee")}
              </p>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-black/40">
              {t("calc.feeNote", { v: q.data.commissionMeta.ruleVersion, fx: FX_LABEL })} ·{" "}
              {q.data.chargeableBasis === "real_channel"
                ? t("calc.basisReal", { note: q.data.volumetricNote })
                : q.data.chargeableBasis === "actual_unsized"
                  ? t("calc.basisUnsized", { w: q.data.chargeableWeight, note: q.data.volumetricNote })
                  : t("calc.basisVolumetric", { w: q.data.chargeableWeight, note: q.data.volumetricNote })}
              {q.data.chargeableBasis !== "real_channel" && t("calc.zonedSuffix")}
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
                  {t("calc.compareTitle", {
                    n: compare.length,
                    u: q.data.channelAdvice.unavailable?.length
                      ? t("calc.unavailableSuffix", { n: q.data.channelAdvice.unavailable.length })
                      : "",
                  })}
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
                      <th className="pb-2 font-medium">{t("calc.thChannel")}</th>
                      <th className="pb-2 font-medium">{t("calc.thWeight")}</th>
                      <th className="pb-2 font-medium">{t("calc.thFreight")}</th>
                      <th className="pb-2 font-medium">{t("calc.thLanded")}</th>
                      <th className="pb-2 font-medium">{t("calc.thTransit")}</th>
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
                        <td className="py-2" colSpan={4}>{t("calc.unavailableRow", { r: u.reason })}</td>
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
