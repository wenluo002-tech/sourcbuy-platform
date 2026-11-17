// P4 供应商核查报告：申请页（兑换入口 + 我的报告列表）
// 纪律：余额与兑换价都来自服务端；生成是异步管线（1–2 分钟），提交后轮询状态；
//   失败自动退分——前端只如实展示，不做任何客户端假设。
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";

export default function Verify() {
  const { me, loading } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const balQ = trpc.points.balance.useQuery(undefined, { enabled: !!me });
  const myQ = trpc.verify.my.useQuery(undefined, { enabled: !!me });
  const reqM = trpc.verify.request.useMutation();

  if (loading) return null;

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sb-brand)]">Supplier Verification</p>
        <h1 className="mt-2 text-xl font-semibold">{t("verify.title")}</h1>
        <p className="mt-3 text-sm text-[var(--sb-ink-60)]">{t("verify.loginFirst")}</p>
        <Link to="/login?next=/verify" className="mt-6 inline-block rounded-xl bg-[var(--sb-brand)] px-6 py-2.5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)]">
          {t("nav.signIn")}
        </Link>
      </div>
    );
  }

  const balance = balQ.data?.balance ?? 0;
  const cost = balQ.data?.reportCost ?? 1000;
  const enough = balance >= cost;

  const submit = async () => {
    setErr(null);
    if (company.trim().length < 4 || company.trim().length > 100) { setErr(t("verify.invalidName")); return; }
    if (!enough) { setErr(t("verify.notEnough")); return; }
    try {
      const r = await reqM.mutateAsync({ companyName: company.trim(), productWord: product.trim() || undefined });
      nav(`/verify/${r.reportId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg.includes("not_enough_points") ? t("verify.notEnough") : msg.includes("invalid_company_name") ? t("verify.invalidName") : msg);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sb-brand)]">Supplier Verification</p>
      <h1 className="mt-1 font-[var(--sb-font-display)] text-2xl font-semibold">{t("verify.title")}</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--sb-ink-60)]">{t("verify.sub")}</p>

      {/* 兑换卡 */}
      <div className="mt-6 rounded-2xl border border-[var(--sb-line)] bg-white p-5">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-[#f2f7fd] px-3 py-1.5 font-medium text-[var(--sb-ink)]">
            {t("verify.balance")}: <b className="tabular-nums text-[var(--sb-brand)]">{balance.toLocaleString()}</b> {t("verify.pointsUnit")}
          </span>
          <span className="rounded-full bg-[#f2f7fd] px-3 py-1.5 font-medium text-[var(--sb-ink)]">
            {t("verify.cost")}: <b className="tabular-nums">{cost.toLocaleString()}</b> {t("verify.pointsUnit")}
          </span>
        </div>
        <label className="mt-4 block text-xs font-medium text-[var(--sb-ink-60)]">{t("verify.companyLabel")}</label>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={t("verify.companyPh")}
          className="mt-1.5 w-full rounded-xl border border-[var(--sb-line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--sb-brand)]"
        />
        <label className="mt-3 block text-xs font-medium text-[var(--sb-ink-60)]">{t("verify.productLabel")}</label>
        <input
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder={t("verify.productPh")}
          className="mt-1.5 w-full rounded-xl border border-[var(--sb-line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--sb-brand)]"
        />
        {err && <p className="mt-3 text-xs text-[#b00020]">{err}</p>}
        <button
          onClick={submit}
          disabled={reqM.isPending || !enough}
          className="mt-4 w-full rounded-xl bg-[var(--sb-brand)] py-3 text-sm font-semibold text-[#eef4f5] transition-colors hover:bg-[var(--sb-brand-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {reqM.isPending ? t("verify.generating") : t("verify.submit")}
        </button>
        {!enough && <p className="mt-2 text-center text-xs text-[var(--sb-ink-40)]">{t("verify.notEnough")}</p>}
      </div>

      {/* 我的报告 */}
      <h2 className="mt-8 text-sm font-semibold">{t("verify.myReports")}</h2>
      <div className="mt-3 space-y-2">
        {(myQ.data ?? []).length === 0 && <p className="text-sm text-[var(--sb-ink-40)]">{t("verify.emptyReports")}</p>}
        {(myQ.data ?? []).map((r) => (
          <Link
            key={r.id}
            to={`/verify/${r.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--sb-line)] bg-white px-4 py-3 transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.company_name}</p>
              <p className="mt-0.5 text-xs text-[var(--sb-ink-40)]">{r.report_no} · {String(r.created_at).slice(0, 10)}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              r.status === "ready" ? "bg-[#e7f6ec] text-[#0a7a30]"
              : r.status === "failed" ? "bg-[#fdeaea] text-[#b00020]"
              : "bg-[#fdf6e3] text-[#92610a]"
            }`}>
              {r.status === "ready" ? t("verify.view") : r.status === "failed" ? t("verify.failedBadge") : t("verify.generatingBadge")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
