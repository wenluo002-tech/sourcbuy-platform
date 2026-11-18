/**
 * 探源单详情页（P1，2026-11-18）：/sourcing/:id
 * 两种面孔一份真相：进行中=大步骤条+事件流水；delivered=交付页仪式感模块
 * （温度提示语按 humanVerified 变量驱动 + 入围名单 + 「本次探源免费」固定位，词条表 v1.1 E/F 节原文）。
 */
import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useT } from "@/i18n";
import { SourcingProgressCard } from "@/components/SourcingProgressCard";

export default function SourcingRequest() {
  const { t } = useT();
  const { id } = useParams();
  const reqId = Number(id);
  const q = trpc.sourcing.get.useQuery(
    { id: reqId },
    { enabled: Number.isFinite(reqId), refetchInterval: (query) => { const s = query.state.data?.status; return s && s !== "delivered" && s !== "failed" ? 8000 : false; } },
  );
  const v = q.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {!v && <div className="text-sm text-[var(--sb-ink-40)]">…</div>}
      {v && (
        <div className="space-y-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--sb-ink-40)]">{v.requestNo}</div>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--sb-ink)]">{v.keyword}</h1>
          </div>

          <SourcingProgressCard requestId={v.id} />

          {/* 交付页仪式感模块：词条表 v1.1 E 节——温度提示语（变量驱动）+ 入围名单 + 免费固定位 */}
          {v.status === "delivered" && (
            <div className="rounded-2xl border border-[var(--sb-line)] bg-white p-6">
              <p className="text-sm leading-relaxed text-[var(--sb-ink)]">
                {v.humanVerified ? t("sr.topNoteHuman") : t("sr.topNoteAi")}
              </p>
              <div className="mt-5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[var(--sb-ink)]">{t("sr.shortlistTitle")}</span>
                  <span className="rounded-full bg-[var(--sb-brand-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--sb-brand)]">
                    {t("sr.tierTag")}
                  </span>
                </div>
                <div className="mt-3 divide-y divide-[var(--sb-line)]">
                  {v.shortlist.map((c) => (
                    <div key={c.id} className="flex flex-col items-start gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div>
                        <div className="text-sm font-medium text-[var(--sb-ink)]">
                          {t("sr.factoryMask")} No.{String(c.id).padStart(4, "0")}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[var(--sb-ink-40)]">
                          {[c.province, c.city].filter(Boolean).join(" · ")}
                          {c.establishDate ? ` · ${t("sr.estPrefix")}${String(c.establishDate).slice(0, 4)}` : ""}
                          {c.isForeignTrade ? ` · ${t("sr.foreignTrade")}` : ""}
                        </div>
                      </div>
                      <Link
                        to="/verify"
                        className="shrink-0 rounded-lg border border-[var(--sb-brand)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--sb-brand)] transition-colors hover:bg-[var(--sb-brand-soft)]"
                      >
                        {t("sr.getReport")}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
              {/* 底部固定位：paid_cents=0 才亮（收费上线后自动切换，UI 零改动） */}
              {v.paidCents === 0 && (
                <div className="mt-5 border-t border-[var(--sb-line)] pt-4 text-center text-[13px] text-[var(--sb-ink-40)]">
                  {t("sr.freeFooter")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
