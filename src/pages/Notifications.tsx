// M4a 消息中心：报价/订单状态/系统通知；未读加粗+圆点；点一条标已读并按 link 跳转
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";

export default function Notifications() {
  const { me, loading } = useAuth();
  const { t, lang } = useT();
  const nav = useNavigate();
  const utils = trpc.useUtils();
  const listQ = trpc.notifications.list.useQuery(undefined, { enabled: !!me });
  const invalidate = () => {
    utils.notifications.list.invalidate();
    utils.notifications.unreadCount.invalidate();
    utils.dashboard.summary.invalidate();
  };
  const readMut = trpc.notifications.markRead.useMutation({ onSuccess: invalidate });
  const allMut = trpc.notifications.markAllRead.useMutation({ onSuccess: invalidate });

  if (loading) return null;

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t("dash.loginTitle")}</h1>
        <p className="mt-3 text-sm text-[var(--sb-ink-60)]">{t("dash.loginBody")}</p>
        <Link to="/login?next=/notifications" className="mt-6 inline-block rounded-xl bg-[var(--sb-brand)] px-6 py-2.5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)]">
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
          <h1 className="font-[var(--sb-font-display)] text-2xl font-semibold">{t("notif.title")}</h1>
          <p className="mt-1 text-xs text-[var(--sb-ink-40)]">{t("notif.sub")}</p>
        </div>
        {!!listQ.data?.some((n) => !n.readAt) && (
          <button
            onClick={() => allMut.mutate()}
            disabled={allMut.isPending}
            className="shrink-0 rounded-xl border border-[var(--sb-line)] bg-white px-4 py-2 text-xs font-medium text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
          >
            {t("notif.markAll")}
          </button>
        )}
      </div>

      <div className="mt-5 space-y-2.5">
        {listQ.isLoading ? (
          <p className="py-10 text-center text-sm text-[var(--sb-ink-40)]">…</p>
        ) : !listQ.data?.length ? (
          <div className="rounded-2xl border border-dashed border-[var(--sb-line)] py-12 text-center">
            <p className="text-sm text-[var(--sb-ink-40)]">{t("notif.empty")}</p>
          </div>
        ) : (
          listQ.data.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.readAt) readMut.mutate({ id: n.id });
                if (n.link) nav(n.link);
              }}
              className={`w-full rounded-2xl border bg-white p-4 text-left transition-shadow hover:shadow-[0_2px_8px_rgba(11,11,11,0.06)] ${
                n.readAt ? "border-[var(--sb-line)]" : "border-[var(--sb-brand)]/40"
              }`}
            >
              <div className="flex items-start gap-2.5">
                {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--sb-brand)]" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.readAt ? "text-[var(--sb-ink-60)]" : "font-semibold"}`}>{n.title}</p>
                  {n.body && <p className="mt-1 text-xs text-[var(--sb-ink-60)]">{n.body}</p>}
                  <p className="mt-1.5 text-[10px] text-[var(--sb-ink-40)]">{fmt(n.createdAt)}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
