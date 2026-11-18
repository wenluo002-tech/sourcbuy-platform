/**
 * 探源步骤条卡（P1，2026-11-18）：挂在 AI 答卡下方，跟随本轮对话触发的探源单。
 * 两端同源：只读 sourcing.get（主表+events 流水），与 Admin 看板一份真相。
 * 纪律：零假动画——每步只显示真实数量+状态；failed 必亮安抚话术+「转人工」入口（死胡同违法）。
 */
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useT } from "@/i18n";

const STEPS = ["received", "scanned", "screened", "verifying", "shortlisted", "delivered"] as const;
const STEP_LABEL: Record<string, string> = {
  received: "sr.stepReceived", scanned: "sr.stepScanned", screened: "sr.stepScreened",
  verifying: "sr.stepVerifying", shortlisted: "sr.stepShortlisted", delivered: "sr.stepDelivered",
};
const COUNT_LABEL: Record<string, string> = {
  scanned: "sr.countScan", screened: "sr.countPass", shortlisted: "sr.countShortlist",
};
const FAIL_COPY: Record<string, string> = {
  no_keyword: "sr.failNoKeyword", upstream_error: "sr.failUpstream",
  zero_candidates: "sr.failZero", manual_pending_timeout: "sr.failManualTimeout",
};

export function SourcingProgressCard({ requestId }: { requestId: number }) {
  const { t } = useT();
  const q = trpc.sourcing.get.useQuery(
    { id: requestId },
    { refetchInterval: (query) => { const s = query.state.data?.status; return s && s !== "delivered" && s !== "failed" ? 8000 : false; } },
  );
  const esc = trpc.sourcing.escalate.useMutation({ onSuccess: () => void q.refetch() });
  const v = q.data;
  if (!v) return null;

  if (v.status === "failed" && esc.isSuccess) {
    // 转人工成功：状态已流转 verifying，等下一轮 refetch 自然切到步骤条
    return (
      <div className="max-w-[94%] rounded-2xl border border-[var(--sb-line)] bg-white p-4 text-[13px] text-[var(--sb-ink)]">
        {t("sr.handoffDone")}
      </div>
    );
  }

  if (v.status === "failed") {
    return (
      <div className="max-w-[94%] rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="text-[13px] font-semibold text-amber-900">{t("sr.failedTitle")}</div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-amber-800">
          {t(FAIL_COPY[v.failReason ?? "upstream_error"] ?? "sr.failUpstream")}
        </p>
        <button
          onClick={() => esc.mutate({ id: requestId })}
          disabled={esc.isPending}
          className="mt-3 rounded-lg bg-[var(--sb-brand)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {t("sr.handoff")}
        </button>
      </div>
    );
  }

  const stageIdx = STEPS.indexOf(v.status as (typeof STEPS)[number]);
  const lastCountOf = (stage: string) => {
    const ev = [...v.events].reverse().find((e) => e.stage === stage);
    return ev?.count ?? null;
  };
  const done = (i: number) => i < stageIdx;
  const current = (i: number) => i === stageIdx;

  return (
    <div className="max-w-[94%] rounded-2xl border border-[var(--sb-line)] bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--sb-ink)]">
          {t(v.status === "delivered" ? "sr.cardTitleDone" : "sr.cardTitle")}
        </span>
        <span className="text-[11px] text-[var(--sb-ink-40)]">{v.requestNo}</span>
      </div>
      <div className="mt-3 flex items-start gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const cnt = lastCountOf(s);
          const labelKey = COUNT_LABEL[s];
          return (
            <div key={s} className="flex shrink-0 items-start">
              <div className="flex min-w-[64px] flex-col items-center text-center">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    done(i) ? "bg-[var(--sb-brand)]" : current(i) ? "bg-[var(--sb-brand)] ring-4 ring-[var(--sb-brand)]/15" : "bg-[var(--sb-line)]"
                  }`}
                />
                <span className={`mt-1.5 text-[11px] leading-tight ${done(i) || current(i) ? "font-medium text-[var(--sb-ink)]" : "text-[var(--sb-ink-40)]"}`}>
                  {t(STEP_LABEL[s])}
                </span>
                <span className="mt-0.5 text-[10px] leading-tight text-[var(--sb-ink-40)]">
                  {done(i) && cnt != null && labelKey
                    ? t(labelKey).replace("{n}", String(cnt))
                    : current(i) && v.status !== "delivered"
                      ? t("sr.running")
                      : done(i) || current(i)
                        ? ""
                        : t("sr.pending")}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span className={`mx-0.5 mt-[4px] h-px w-4 shrink-0 ${done(i) ? "bg-[var(--sb-brand)]" : "bg-[var(--sb-line)]"}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--sb-line)] pt-2.5">
        <span className="text-[11px] text-[var(--sb-ink-40)]">
          {v.slaHours != null ? t("sr.promised").replace("{n}", String(v.slaHours)) : t("sr.etaOnly")}
        </span>
        <Link to={`/sourcing/${v.id}`} className="text-[12px] font-medium text-[var(--sb-brand)] hover:underline">
          {t("sr.viewDetail")}
        </Link>
      </div>
    </div>
  );
}
