import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { CountUp, useReveal } from "@/hooks/useReveal";
import { useT } from "@/i18n";
import { catLabel } from "@/i18n/categories";
import { RadarCard } from "@/pages/Radar";
import { AttachButton, PickerBlockedHint } from "@/components/AttachButton";
import { compressImageToDataURL } from "@/lib/imageCompress";

const TIER_ORDER = ["金标", "银标", "铜标", "优选", "培育"];

export default function Home() {
  const { t, lang } = useT();
  const stats = trpc.factories.stats.useQuery(undefined, { staleTime: 60_000 });
  const catStats = trpc.factories.categoryStats.useQuery({ locale: lang }, { staleTime: 60_000 });
  const featured = trpc.factories.match.useQuery({ minScore: 90, limit: 6, locale: lang });
  const radar = trpc.radar.list.useQuery({ locale: lang }, { staleTime: 60_000 });
  const [kw, setKw] = useState("");
  const navigate = useNavigate();
  const pageRef = useReveal<HTMLDivElement>();

  const goChat = (text: string) => {
    const q = text.trim();
    navigate(q ? `/buyer?prefill=${encodeURIComponent(q)}` : "/buyer");
  };

  // 首页附件入口：图片压缩后接力给对话页；图纸/文档只带文件名（内容不入库，走 48h 人工核价通道）
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachBusy, setAttachBusy] = useState(false); // 大图压缩有耗时，必须立刻亮处理中遮罩——静默=「点了没反应」事故
  const [pickerBlocked, setPickerBlocked] = useState(false); // 选择器被 WebView 系统层拦截时亮逃生门
  function onPickAttach(f: File) {
    setPickerBlocked(false); // 文件到手=选择器没死，收掉逃生门
    // 超限必须显式告诉买家——静默 return 在演示场合就是"点了没反应"事故
    if (f.size > 20 * 1024 * 1024) { setAttachError(t("chat.imageTooLarge", { n: 20 })); return; }
    setAttachError(null);
    const isImg = f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name);
    if (!isImg) {
      sessionStorage.setItem("sb.attach", JSON.stringify({ kind: "doc", name: f.name }));
      navigate("/buyer");
      return;
    }
    setAttachBusy(true);
    compressImageToDataURL(f)
      .then((data) => {
        sessionStorage.setItem("sb.attach", JSON.stringify({ kind: "image", data }));
        navigate("/buyer");
      })
      .catch(() => {
        // HEIC 等解不了的格式：显式报错，绝不静默
        setAttachBusy(false);
        setAttachError(t("chat.imageBadFormat"));
      });
  }

  const tierCount = (t: string) =>
    stats.data?.byTier.find((x) => x.tier === t)?.c ?? 0;

  return (
    <div ref={pageRef} className="space-y-14 md:space-y-20">
      {/* 大图压缩处理中遮罩：选中照片即刻亮出，绝不静默（演示场合静默=「点了没反应」事故） */}
      {attachBusy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/85 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--sb-rule)] bg-white px-5 py-4 shadow-lg">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--sb-brand)] border-t-transparent" />
            <span className="text-sm text-[var(--sb-ink)]">{t("home.processingPhoto")}</span>
          </div>
        </div>
      )}
      {/* ===== Hero：事务所版式——细线框架 + 右侧挺括图栏 + 衬线大标题 ===== */}
      <section className="sb-reveal relative border-y border-[var(--sb-rule)]">
        {/* 背景：太空科技图 100vw 满屏平铺（突破内容容器），左实右虚蒙版保文字可读 */}
        <div
          className="absolute inset-y-0 left-1/2 hidden w-screen -translate-x-1/2 md:block"
          style={{
            backgroundImage: "url('/hero-bg.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "right center",
          }}
        />
        {/* 桌面端蒙版：只保左侧文字区可读，右侧让图铺满透出 */}
        <div
          className="absolute inset-y-0 left-1/2 hidden w-screen -translate-x-1/2 md:block"
          style={{
            background:
              "linear-gradient(90deg, rgba(243,248,252,0.97) 0%, rgba(243,248,252,0.92) 28%, rgba(243,248,252,0.62) 48%, rgba(243,248,252,0.18) 68%, rgba(243,248,252,0.02) 100%)",
          }}
        />
        {/* 移动端：图同样 100vw 满屏平铺，均匀浅蒙版保整区可读 */}
        <div
          className="absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 md:hidden"
          style={{
            backgroundImage: "url('/hero-bg.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          className="absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 md:hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(243,248,252,0.95) 0%, rgba(243,248,252,0.88) 42%, rgba(243,248,252,0.68) 72%, rgba(243,248,252,0.45) 100%)",
          }}
        />
        {/* 文字与行动区 */}
        <div className="relative px-1 py-10 sm:py-14 md:py-20 lg:max-w-[62%]">
          <span className="sb-eyebrow flex items-center gap-2">
            <span className="sb-dot-live inline-block h-1.5 w-1.5 rounded-full bg-[var(--sb-brand)]" />
            {t("home.eyebrow")}
          </span>

            <h1 className={`sb-display mt-6 text-[clamp(30px,7vw,44px)] leading-[1.14] tracking-tight ${lang !== "zh" ? "md:text-[clamp(36px,4.5vw,56px)] md:leading-[1.1]" : "md:text-[64px] md:leading-[1.08]"}`}>
              <span className="sb-line-mask"><span className={lang !== "zh" ? undefined : "whitespace-nowrap"}>{t("home.h1Line1")}</span></span>
              <span className="sb-line-mask"><span className={lang !== "zh" ? undefined : "whitespace-nowrap"} style={{ ["--sb-delay" as string]: "100ms" }}>{t("home.h1Line2Pre")}<span className="text-[var(--sb-brand)]">{t("home.h1Line2Accent")}</span>{t("home.h1Line2Post")}</span></span>
            </h1>

            {/* 品牌 Slogan：定稿 2026-11-10（AI 采购，全程兜底 / Source with AI. We cover the rest.） */}
            <p className="sb-display mt-5 text-[17px] italic leading-snug tracking-wide text-[var(--sb-brand)] sm:text-[19px]">
              {t("home.slogan")}
            </p>

            {/* 信任信号：主线一句 + 三条优势（对勾精致版） */}
            <div className="mt-7 flex items-center gap-3.5">
              <span className="h-px w-10 shrink-0 bg-[var(--sb-brand)]" />
              <span className="text-[14px] font-medium tracking-[0.08em] text-[var(--sb-ink)] sm:text-[15px]">
                {t("home.trustMain")}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2">
              {(t("home.trustPoints") as string[]).map((pt) => (
                <span key={pt} className="flex items-center gap-2 text-[13px] text-[var(--sb-ink-60)]">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-[var(--sb-brand)]">
                    <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5 8.2 7.2 10.4 11 5.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {pt}
                </span>
              ))}
            </div>

            <form
              className="mt-9 max-w-2xl"
              onSubmit={(e) => {
                e.preventDefault();
                goChat(kw);
              }}
            >
              {/* 真实 input 全尺寸覆盖在按钮上（opacity-0），指尖直接点在文件控件本体——
                  htmlFor 转发和 JS click 在部分 WebView 都会被吞（v81 罗总手机实测复现后的根治形态）。
                  accept 只放通用 MIME（image/*、PDF），DWG 等冷门扩展名会让某些 WebView 打不开选择器，改由 JS 校验 */}
              <div className="flex items-stretch border border-[var(--sb-rule)] bg-white">
                <input
                  value={kw}
                  onChange={(e) => setKw(e.target.value)}
                  placeholder={t("home.placeholder")}
                  className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[15px] placeholder:text-[var(--sb-ink-40)] focus-visible:outline-none"
                />
                <AttachButton
                  title={t("home.attachBtn")}
                  accept="image/*,application/pdf"
                  className="flex shrink-0 items-center gap-1.5 border-l border-[var(--sb-rule)] px-3.5 text-xs font-medium text-[var(--sb-ink-60)] transition-colors hover:text-[var(--sb-brand)] sm:px-4"
                  onFile={onPickAttach}
                  onChooserBlocked={() => setPickerBlocked(true)}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="m10.5 4.5-4.95 4.95a2 2 0 1 0 2.83 2.83l5.3-5.3a3.5 3.5 0 1 0-4.95-4.95L4.4 6.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" transform="translate(-1 2) scale(0.92)" />
                  </svg>
                  <span className="hidden sm:inline">{t("home.attachBtn")}</span>
                </AttachButton>
                {/* 拍照寻源：手机直唤后置相机，拍完经 sb.attach 接力进对话页走图片识别寻源 */}
                <AttachButton
                  title={t("home.cameraBtn")}
                  accept="image/*"
                  capture="environment"
                  className="flex shrink-0 items-center gap-1.5 border-l border-[var(--sb-rule)] px-3.5 text-xs font-medium text-[var(--sb-ink-60)] transition-colors hover:text-[var(--sb-brand)] sm:px-4"
                  onFile={onPickAttach}
                  onChooserBlocked={() => setPickerBlocked(true)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9 4.8A1 1 0 0 1 9.9 4.3h4.2a1 1 0 0 1 .9.5l1.5 2.2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <span className="hidden sm:inline">{t("home.cameraBtn")}</span>
                </AttachButton>
                <button
                  type="submit"
                  className="flex shrink-0 items-center gap-2 bg-[var(--sb-brand)] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[var(--sb-brand-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sb-brand)] sm:px-7"
                >
                  {t("home.cta")}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2 8h11M9 3.5 14 8l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              {attachError && (
                <p className="mt-2 text-xs text-[#92610a]">{attachError}</p>
              )}
              {pickerBlocked && (
                <div className="mt-2">
                  <PickerBlockedHint />
                </div>
              )}
            </form>

            <div className="mt-6 flex flex-wrap items-baseline gap-x-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--sb-ink-40)]">
                {t("home.tryAsking")}
              </p>
              <p className="text-[11px] text-[var(--sb-ink-40)]">
                {t("home.linkHint")}
              </p>
            </div>
            <div className="mt-1 grid max-w-2xl grid-cols-1 sm:grid-cols-2 sm:gap-x-8">
              {(t("home.examples") as string[]).map((s, i) => (
                <button
                  key={s}
                  onClick={() => goChat(s)}
                  className="group flex items-baseline gap-2.5 border-b border-[var(--sb-line)] py-2.5 text-left transition-colors duration-150"
                >
                  <span className="sb-index shrink-0 text-[10px] text-[var(--sb-ink-40)] transition-colors duration-150 group-hover:text-[var(--sb-brand)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] text-[var(--sb-ink-60)] transition-colors duration-150 group-hover:text-[var(--sb-brand)]">
                    {s}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--sb-ink-40)] opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--sb-brand)] group-hover:opacity-100">
                    →
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-10 border-t border-[var(--sb-line)] pt-4 text-[11px] text-[var(--sb-ink-60)] sm:text-xs">
              {t("home.pledge")}
            </p>
          </div>

          <div className="absolute bottom-3 left-4 hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[rgba(21,37,49,0.75)] md:flex">
            <span className="sb-dot-live inline-block h-1.5 w-1.5 rounded-full bg-[var(--sb-brand)]" />
            China Supply Network · Live
          </div>
      </section>

      {/* ===== 海外爆款雷达：需求信号 → 产能 → 出厂价带，每周更新 ===== */}
      {/* 区域框架常驻：接口失败/加载中只换内容行，不让整个区块消失 */}
      <section>
        <div className="sb-reveal sb-rule flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
            {t("home.radarKicker")} · {t("home.radarTitle")}
          </h2>
          <Link
            to="/radar"
            className="text-sm font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline"
          >
            {t("home.radarMore")}
          </Link>
        </div>
        <p className="sb-reveal mt-2 text-xs text-[var(--sb-ink-40)]">
          {t("home.radarDesc")}
        </p>
        {radar.isError ? (
          <p className="mt-6 border-t border-[var(--sb-line)] pt-5 text-sm text-[var(--sb-ink-60)]">
            {t("home.radarError")}
          </p>
        ) : (radar.data?.items?.length ?? 0) > 0 ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {radar.data!.items.slice(0, 6).map((it, i) => (
              <RadarCard key={it.id} it={it} i={i} />
            ))}
          </div>
        ) : (
          <p className="mt-6 border-t border-[var(--sb-line)] pt-5 text-sm text-[var(--sb-ink-40)]">
            {t("home.radarLoading")}
          </p>
        )}
      </section>

      {/* ===== 实时数字：台账版式——衬线大数字 + 纵向细线分栏 ===== */}
      {!stats.isError && (
      <section>
        <div className="sb-reveal sb-rule flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
            {t("home.statsKicker")}
          </h2>
          <span className="whitespace-nowrap text-xs text-[var(--sb-ink-40)]">{t("home.statsNote")}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-y-7 border-t border-[var(--sb-line)] sm:grid-cols-3 lg:grid-cols-6">
          <div className="sb-reveal pt-6 sm:pt-7">
            <div className="sb-display text-[34px] leading-none tracking-tight sm:text-[40px]">
              {stats.data ? <CountUp value={stats.data.total} /> : "…"}
            </div>
            <div className="mt-2.5 text-xs font-medium text-[var(--sb-ink)]">{t("home.statFactories")}</div>
            <div className="mt-1 text-[11px] leading-snug text-[var(--sb-ink-40)]">
              {t("home.statFactoriesSub")}
            </div>
          </div>
          {TIER_ORDER.map((t2, i) => (
            <div key={t2} className="sb-reveal border-l border-[var(--sb-line)] pl-4 pt-6 sm:pl-5 sm:pt-7" style={{ ["--sb-delay" as string]: `${(i + 1) * 90}ms` }}>
              <div className="sb-display text-[34px] leading-none tracking-tight sm:text-[40px]">
                {stats.data ? <CountUp value={tierCount(t2)} /> : "…"}
              </div>
              <div className="mt-2.5 text-xs font-medium text-[var(--sb-ink)]">{t(`home.tierName.${t2}`)}{t("home.tierSuffix") && ` ${t("home.tierSuffix")}`}</div>
              <div className="mt-1 text-[11px] leading-snug text-[var(--sb-ink-40)]">
                {t(`home.tierDesc.${t2}`)}
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* ===== 品类覆盖：类目×独立工厂数（真实打标统计），点击直接发起 AI 寻源 ===== */}
      {!catStats.isError && (catStats.data?.byCategory?.length ?? 0) > 0 && (
      <section>
        <div className="sb-reveal sb-rule flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
            {t("home.catKicker")} · {t("home.catTitle")}
          </h2>
          <span className="whitespace-nowrap text-xs text-[var(--sb-ink-40)]">
            <b className="font-semibold text-[var(--sb-ink)]">{catStats.data!.tagged.toLocaleString()}</b> {t("home.catTagged")} · {t("home.catRest")}
          </span>
        </div>
        <div className="mt-4 grid border-t border-[var(--sb-line)] sm:grid-cols-2 lg:grid-cols-3">
          {catStats.data!.byCategory.map((row, i) => {
            const max = Number(catStats.data!.byCategory[0]?.c ?? 1);
            const pct = Math.max(2, Math.round((Number(row.c) / max) * 100));
            const label = catLabel(row.category, lang);
            return (
              <button
                key={row.category}
                type="button"
                onClick={() => goChat(lang !== "zh" ? `I'm looking for factories making ${label}` : `我想找做${label}的工厂`)}
                className="sb-reveal group border-b border-[var(--sb-line)] px-1 py-4 text-left transition-colors duration-300 hover:bg-white/60 sm:px-4"
                style={{ ["--sb-delay" as string]: `${Math.min(i, 8) * 60}ms` }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--sb-ink)] transition-colors duration-300 group-hover:text-[var(--sb-brand)]">{label}</span>
                  <span className="sb-display text-lg leading-none tracking-tight">{Number(row.c).toLocaleString()}</span>
                </div>
                <div className="mt-2 h-[3px] w-full bg-black/[0.07]">
                  <div className="h-full bg-[var(--sb-brand)] opacity-60 transition-all duration-500 group-hover:opacity-100" style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </section>
      )}

      {/* ===== 服务方式（叙事三步） ===== */}
      <section>
        <h2 className="sb-reveal sb-rule pt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
          {t("home.howKicker")} · {t("home.howTitle")}
        </h2>
        <div className="mt-4 border-t border-[var(--sb-line)]">
          {(t("home.steps") as [string, string][]).map(([title, desc], i) => (
            <div
              key={title}
              className="sb-reveal group grid gap-1.5 border-b border-[var(--sb-line)] py-5 transition-colors duration-300 hover:bg-white/60 md:grid-cols-[120px_200px_1fr] md:gap-6 md:py-7"
              style={{ ["--sb-delay" as string]: `${i * 90}ms` }}
            >
              <div className="flex items-baseline gap-3 md:contents">
                <span className="sb-index text-xs font-semibold uppercase text-[var(--sb-ink-40)] transition-colors duration-300 group-hover:text-[var(--sb-brand)]">
                  Step {i + 1}
                </span>
                <h3 className="sb-display text-[17px]">{title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-[var(--sb-ink-60)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 三不承诺 ===== */}
      <section>
        <h2 className="sb-reveal sb-rule pt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
          {t("home.promiseKicker")} · {t("home.promiseTitle")}
        </h2>
        <div className="mt-4 border-t border-[var(--sb-line)]">
          {(t("home.promises") as [string, string][]).map(([title, desc], i) => (
            <div
              key={title}
              className="sb-reveal grid gap-1.5 border-b border-[var(--sb-line)] py-5 transition-colors duration-300 hover:bg-white/60 md:grid-cols-[120px_200px_1fr] md:gap-6 md:py-7"
              style={{ ["--sb-delay" as string]: `${i * 90}ms` }}
            >
              <div className="flex items-baseline gap-3 md:contents">
                <span className="sb-index text-xs font-semibold uppercase text-[var(--sb-ink-40)]">
                  0{i + 1}
                </span>
                <h3 className="sb-display text-[17px]">{title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-[var(--sb-ink-60)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 头部工厂：台账卡——细线顶规 + 衬线厂名 + 索引号 ===== */}
      <section>
        <div className="sb-reveal sb-rule flex items-baseline justify-between pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sb-brand)]">
            {t("home.topKicker")} · {t("home.topTitle")}
          </h2>
          <Link
            to="/factories"
            className="text-sm font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline"
          >
            {t("home.topMore")}
          </Link>
        </div>
        <div className="mt-4 grid gap-x-6 gap-y-0 border-t border-[var(--sb-line)] sm:grid-cols-2 lg:grid-cols-3">
          {(featured.data ?? []).map((f, i) => (
            <Link
              key={f.id}
              to={`/factories/${f.id}`}
              className="sb-reveal group border-b border-[var(--sb-line)] py-4 transition-colors duration-200 hover:bg-white/60"
              style={{ ["--sb-delay" as string]: `${i * 70}ms` }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="sb-index text-[11px] text-[var(--sb-ink-40)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="sb-num shrink-0 text-xs font-semibold text-[var(--sb-brand)]">
                  {t(`home.tierName.${f.tier}`)} {f.score}
                </span>
              </div>
              <h3 className="sb-display mt-1.5 line-clamp-1 text-[16px] leading-snug text-[var(--sb-ink)] [@media(hover:hover)]:group-hover:text-[var(--sb-brand)]">
                {(f as any).masked ? t("chat.maskedName", { n: String(f.id).padStart(4, "0") }) : f.name}
              </h3>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--sb-ink-60)]">
                {f.reason}
              </p>
              <p className="sb-num mt-2 text-[11px] text-[var(--sb-ink-40)]">
                {f.location}
                {f.years ? ` · ${f.years}${t("home.yearSuffix")}` : ""}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
