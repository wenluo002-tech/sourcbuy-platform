// P4 在线核查报告页：决策卡先行 → 核验矩阵 → 底档/产能/证书/出口 → 来源 → 三出口 CTA（可点）
// 与 PDF 共用同一份 report 快照；生成中自动轮询；PDF 下载走 fetch+Bearer 双通道（cookie 被拦的 WebView 也能下）。
import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";
import type { ReportSnapshot } from "../../api/queries/verification";

type MatrixStatus = ReportSnapshot["matrix"][number]["status"];
const STATUS_ORDER: Record<MatrixStatus, number> = { pending: 0, uncovered: 1, verified: 2 };

const SRC_COLOR: Record<string, string> = { 官方公示: "#1f6fb2", 司法公示: "#5b3fa8", 公开报道: "#92610a", 企业自述: "#6b7688" };

function Tag({ t: label }: { t?: string }) {
  if (!label) return null;
  return <span className="ml-1 align-middle text-[10px] font-medium" style={{ color: SRC_COLOR[label] ?? "#6b7688" }}>〔{label}〕</span>;
}

export default function VerifyReport() {
  const { id } = useParams();
  const reportId = Number(id);
  const { me, loading } = useAuth();
  const { t } = useT();
  const q = trpc.verify.get.useQuery({ reportId }, {
    enabled: !!me && Number.isFinite(reportId),
    refetchInterval: (q) => (q.state.data?.status === "generating" ? 2500 : false),
  });

  useEffect(() => { window.scrollTo(0, 0); }, [reportId]);

  if (loading || !me) return null;
  const r = q.data;

  if (!r) return <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-[var(--sb-ink-40)]">404</div>;

  // 生成中
  if (r.status === "generating") {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--sb-brand)] border-t-transparent" />
        <h1 className="mt-6 text-lg font-semibold">{t("verify.generating")}</h1>
        <p className="mt-2 text-sm text-[var(--sb-ink-60)]">{t("verify.generatingDesc")}</p>
      </div>
    );
  }
  // 失败（积分已自动退）
  if (r.status === "failed") {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-lg font-semibold text-[#b00020]">{t("verify.failedBadge")}</h1>
        <p className="mt-2 text-sm text-[var(--sb-ink-60)]">{t("verify.retryHint")}</p>
        <Link to="/verify" className="mt-6 inline-block rounded-xl bg-[var(--sb-brand)] px-6 py-2.5 text-sm font-semibold text-[#eef4f5]">{t("verify.back")}</Link>
      </div>
    );
  }

  const snap = (typeof r.report === "string" ? JSON.parse(r.report) : r.report) as ReportSnapshot | null;
  if (!snap) return null;

  const downloadPdf = async () => {
    const token = localStorage.getItem("sb-token");
    const res = await fetch(`/api/verify/${reportId}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${snap.meta.reportNo}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  const chipCls = (s: string) =>
    s === "verified" ? "bg-[#e7f6ec] text-[#0a7a30]" : s === "pending" ? "bg-[#fdf6e3] text-[#92610a]" : "bg-[#eef1f5] text-[#6b7688]";
  const chipLabel = (s: string) => (s === "verified" ? `✓ ${t("verify.stVerified")}` : s === "pending" ? `⚠ ${t("verify.stPending")}` : `○ ${t("verify.stUncovered")}`);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 头部：编号 + 下载 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sb-brand)]">SourcBuy Verification</p>
          <h1 className="mt-1 text-xl font-semibold">{snap.meta.companyName}</h1>
          <p className="mt-1 text-xs text-[var(--sb-ink-40)]">{snap.meta.reportNo} · {snap.meta.date}</p>
        </div>
        <button onClick={downloadPdf} className="rounded-xl border border-[var(--sb-brand)] px-4 py-2 text-sm font-semibold text-[var(--sb-brand)] hover:bg-[#f2f7fd]">
          {t("verify.downloadPdf")}
        </button>
      </div>

      {/* 决策卡 */}
      <div className="mt-5 rounded-2xl border border-[var(--sb-line)] bg-white p-5">
        <p className="text-xs text-[var(--sb-ink-40)]">{t("verify.conclusionTitle")}</p>
        <p className="mt-2 text-base font-semibold leading-6">
          {t("verify.conclusion", { pending: snap.conclusion.pending, uncovered: snap.conclusion.uncovered })}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--sb-ink-60)]">{snap.conclusion.summary}</p>
        {!!r.in_our_system && (
          <p className="mt-3 inline-block rounded-full bg-[#e7f6ec] px-3 py-1 text-xs font-semibold text-[#0a7a30]">{t("verify.inOurSystem")}</p>
        )}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--sb-line)] pt-4 text-center">
          <div><p className="text-lg font-bold tabular-nums text-[var(--sb-brand)]">{snap.metrics.years ?? "—"}</p><p className="text-[11px] text-[var(--sb-ink-40)]">{t("verify.metricYears")}</p></div>
          <div><p className="text-lg font-bold tabular-nums text-[var(--sb-brand)]">{snap.metrics.certs}</p><p className="text-[11px] text-[var(--sb-ink-40)]">{t("verify.metricCerts")}</p></div>
          <div><p className="text-lg font-bold tabular-nums text-[var(--sb-brand)]">{snap.metrics.coverageDone}/{snap.metrics.coverageTotal}</p><p className="text-[11px] text-[var(--sb-ink-40)]">{t("verify.metricCoverage")}</p></div>
        </div>
        <p className="mt-4 rounded-lg bg-[#fdf6e3] px-3 py-2 text-xs leading-5 text-[#92610a]">{t("verify.maxRiskLabel")}: {snap.maxRisk}</p>
      </div>

      {/* 核验矩阵 */}
      <h2 className="mt-8 text-sm font-semibold">{t("verify.secMatrix")}</h2>
      <div className="mt-3 space-y-2">
        {[...snap.matrix].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]).map((m, i) => (
          <div key={i} className="rounded-xl border border-[var(--sb-line)] bg-white p-3.5">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${chipCls(m.status)}`}>{chipLabel(m.status)}</span>
              <p className="text-sm font-medium">{m.item}<Tag t={m.source} /></p>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-[var(--sb-ink-60)]">{m.detail}</p>
          </div>
        ))}
      </div>

      {/* 工商底档 */}
      <h2 className="mt-8 text-sm font-semibold">{t("verify.secReg")}</h2>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {snap.registration.map((it, i) => (
          <div key={i} className="rounded-xl bg-[#f7f9fc] p-3">
            <p className="text-[11px] text-[var(--sb-ink-40)]">{it.label}<Tag t={it.source} /></p>
            <p className="mt-1 text-sm font-medium">{it.value}</p>
          </div>
        ))}
      </div>
      {snap.mainProducts && <p className="mt-3 text-xs leading-5 text-[var(--sb-ink-60)]"><b>{t("verify.secMainProducts")}:</b>{snap.mainProducts}<Tag t="官方公示" /></p>}
      {snap.intro && <p className="mt-3 rounded-xl bg-white p-4 text-xs leading-6 text-[var(--sb-ink-60)] border border-[var(--sb-line)]">{snap.intro}<Tag t="企业自述" /></p>}

      {/* 产能 */}
      {snap.capacity.paragraphs.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold">{t("verify.secCap")}</h2>
          <div className="mt-3 space-y-2">
            {snap.capacity.paragraphs.map((p, i) => (
              <p key={i} className="rounded-xl border border-[var(--sb-line)] bg-white p-4 text-xs leading-6 text-[var(--sb-ink-60)]">{p.text}<Tag t={p.source} /></p>
            ))}
          </div>
        </>
      )}

      {/* 证书 */}
      {snap.certs.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold">{t("verify.secCerts")}</h2>
          {snap.certs.map((g, gi) => (
            <div key={gi} className="mt-3">
              <p className="text-xs font-semibold text-[var(--sb-ink-60)]">{g.group}</p>
              <div className="mt-1.5 overflow-hidden rounded-xl border border-[var(--sb-line)] bg-white">
                {g.items.map((it, ii) => (
                  <div key={ii} className={`flex justify-between gap-3 px-4 py-2.5 text-xs ${ii % 2 ? "bg-[#f7f9fc]" : ""}`}>
                    <span className="min-w-0 flex-1 font-medium">{it.name}</span>
                    <span className="shrink-0 text-[var(--sb-ink-40)]">{it.no ?? t("verify.certAsOriginal")}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* 出口与边界 */}
      <h2 className="mt-8 text-sm font-semibold">{t("verify.secExp")}</h2>
      <div className="mt-3 space-y-2">
        {snap.exportMarket.markets && <p className="rounded-xl border border-[var(--sb-line)] bg-white p-4 text-xs leading-6 text-[var(--sb-ink-60)]">{snap.exportMarket.markets}<Tag t="公开报道" /></p>}
        {snap.wbCross && (
          <p className="rounded-xl border border-[var(--sb-line)] bg-white p-4 text-xs leading-6 text-[var(--sb-ink-60)]">
            {t("verify.wbCrossText", { years: snap.wbCross.years ?? "—", cat: snap.wbCross.category ?? "" })}<Tag t="公开报道" />
          </p>
        )}
        {snap.boundaries.map((b, i) => (
          <div key={i} className="flex gap-3 rounded-xl bg-[#f7f9fc] px-4 py-2.5 text-xs">
            <span className="shrink-0 font-semibold">{b.item}</span>
            <span className="text-[var(--sb-ink-60)]">{b.note}</span>
          </div>
        ))}
        <p className="rounded-xl border border-[var(--sb-line)] bg-white p-4 text-xs leading-6 text-[var(--sb-ink-60)]">
          {t("verify.reachText", { phones: snap.reachability.phoneCount, dm: snap.reachability.dmCount })}
        </p>
      </div>

      {/* 三出口 CTA（可点，高转化） */}
      <div className="mt-10 rounded-2xl bg-[#12233c] p-6 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-60">Next Step</p>
        <h2 className="mt-1 text-lg font-semibold">{t("verify.ctaTitle")}</h2>
        <p className="mt-1 text-xs opacity-70">{t("verify.ctaSub")}</p>
        <div className="mt-5 space-y-3">
          <Link to="/buyer" className="block rounded-xl border-2 border-[#f0b429] bg-white/10 p-4 transition-colors hover:bg-white/15">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">A · {t("verify.ctaA")}</p>
              <span className="rounded-full bg-[#f0b429] px-2.5 py-0.5 text-[10px] font-bold text-[#12233c]">{t("verify.recommended")}</span>
            </div>
            <p className="mt-1 text-xs opacity-75">{t("verify.ctaADesc")}</p>
          </Link>
          <Link to="/factories" className="block rounded-xl border border-white/20 p-4 transition-colors hover:bg-white/10">
            <p className="text-sm font-semibold">B · {t("verify.ctaB")}</p>
            <p className="mt-1 text-xs opacity-75">{t("verify.ctaBDesc")}</p>
          </Link>
          <Link to="/buyer" className="block rounded-xl border border-white/20 p-4 transition-colors hover:bg-white/10">
            <p className="text-sm font-semibold">C · {t("verify.ctaC")}</p>
            <p className="mt-1 text-xs opacity-75">{t("verify.ctaCDesc")}</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
