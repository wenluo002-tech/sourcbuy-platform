// M4a 我的询价：历史询盘会话列表，点击回放进 /buyer?thread=id（卡片快照零成本回放）
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";

export default function Inquiries() {
  const { me, loading } = useAuth();
  const { t, lang } = useT();
  const listQ = trpc.threads.list.useQuery(undefined, { enabled: !!me });

  if (loading) return null;

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t("dash.loginTitle")}</h1>
        <p className="mt-3 text-sm text-[var(--sb-ink-60)]">{t("dash.loginBody")}</p>
        <Link to="/login?next=/inquiries" className="mt-6 inline-block rounded-xl bg-[var(--sb-brand)] px-6 py-2.5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)]">
          {t("dash.loginCta")}
        </Link>
      </div>
    );
  }

  const fmt = (d: string | Date) =>
    new Date(d).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-[var(--sb-font-display)] text-2xl font-semibold">{t("inq.title")}</h1>
          <p className="mt-1 text-xs text-[var(--sb-ink-40)]">{t("inq.sub")}</p>
        </div>
        <Link
          to="/buyer"
          className="shrink-0 rounded-xl bg-[var(--sb-brand)] px-4 py-2 text-xs font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)]"
        >
          {t("dash.newInquiryCta")}
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {listQ.isLoading ? (
          <p className="py-10 text-center text-sm text-[var(--sb-ink-40)]">…</p>
        ) : !listQ.data?.length ? (
          <div className="rounded-2xl border border-dashed border-[var(--sb-line)] py-12 text-center">
            <p className="text-sm text-[var(--sb-ink-40)]">{t("inq.empty")}</p>
            <Link to="/buyer" className="mt-3 inline-block text-xs font-medium text-[var(--sb-brand)] underline-offset-4 hover:underline">
              {t("inq.emptyCta")}
            </Link>
          </div>
        ) : (
          listQ.data.map((th: any) => (
            <Link
              key={th.id}
              to={`/buyer?thread=${th.id}`}
              className="block rounded-2xl border border-[var(--sb-line)] bg-white p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)]"
            >
              <p className="truncate text-sm font-medium">{th.title || t("inq.untitled")}</p>
              <p className="mt-1 text-xs text-[var(--sb-ink-40)]">{fmt(th.updatedAt)}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
