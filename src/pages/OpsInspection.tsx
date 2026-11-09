// 运营质检判定页 /ops/qc/:id（内部工具，中文硬编码）：证据墙 + 人工判定 + 二检实测 + 签章确认
// 铁律：判定永远由人作出； verdict 四选一（合格/让步接收/返工/拒收）
import { useState } from "react";
import { Link, useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";

const VERDICTS = [
  { v: "pass", label: "合格", cls: "bg-[#0a7a30]" },
  { v: "conditional", label: "让步接收", cls: "bg-[#92610a]" },
  { v: "rework", label: "返工", cls: "bg-[#b06400]" },
  { v: "reject", label: "拒收", cls: "bg-[#b00020]" },
] as const;

export default function OpsInspection() {
  const { id } = useParams<{ id: string }>();
  const { me, loading } = useAuth();
  const reportId = Number(id);
  const q = trpc.inspection.detail.useQuery({ reportId }, { enabled: !!me && Number.isFinite(reportId), retry: false });
  const [note, setNote] = useState("");
  const [verdict, setVerdict] = useState<string | null>(null);
  const [kg, setKg] = useState("");
  const [cbm, setCbm] = useState("");
  const reviewM = trpc.inspection.review.useMutation({ onSuccess: () => q.refetch() });
  const reopenM = trpc.inspection.reopen.useMutation({ onSuccess: () => q.refetch() });
  const signM = trpc.inspection.markSigned.useMutation({ onSuccess: () => q.refetch() });
  const measureM = trpc.inspection.measure.useMutation({ onSuccess: () => q.refetch() });
  const [preview, setPreview] = useState<string | null>(null);

  if (loading) return null;
  if (!me) return <p className="mx-auto max-w-4xl px-4 py-16 text-center text-sm">请先登录运营账号</p>;
  if (q.error?.data?.code === "FORBIDDEN")
    return <p className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-[#b00020]">无运营权限</p>;
  const d = q.data;
  if (q.isLoading) return <p className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-[var(--sb-ink-40)]">加载中…</p>;
  if (!d) return <p className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-[var(--sb-ink-40)]">报告不存在</p>;

  const uploadUrl = `${location.origin}/qc/${d.uploadToken}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link to="/ops" className="text-xs text-[var(--sb-ink-60)] hover:text-[var(--sb-brand)]">← 返回质检工作台</Link>

      <div className="mt-3 rounded-2xl border border-[var(--sb-line)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-base font-bold">
            {d.reportNo}
            <span className="ml-2 rounded bg-black/5 px-1.5 py-0.5 text-[11px] font-medium">{d.phase === 1 ? "一检（出厂）" : "二检（入仓）"}</span>
            <span className="ml-2 rounded bg-black/5 px-1.5 py-0.5 text-[11px] font-medium">{d.template.nameZh}</span>
          </h1>
          <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold">{d.status}</span>
        </div>
        {d.order && (
          <p className="mt-1.5 text-xs text-[var(--sb-ink-60)]">
            订单 {d.order.orderNo} · {d.order.productTitle ?? "—"} {d.order.quantity ? `· ${d.order.quantity} 件` : ""} {d.order.destination ? `· ${d.order.destination}` : ""} · 订单状态 {d.order.status}
          </p>
        )}
        {(d.status === "uploading" || d.status === "pending_review") && (
          <p className="mt-2 select-all break-all rounded-lg bg-[var(--sb-paper)] px-3 py-2 text-[11px] text-[var(--sb-ink-60)]">
            上传链接（发给{d.phase === 1 ? "工厂" : "仓库"}）：<code>{uploadUrl}</code>
            {d.tokenExpiresAt && ` · ${new Date(d.tokenExpiresAt).toLocaleDateString("zh-CN")} 过期`}
          </p>
        )}
        {d.verdict && (
          <p className="mt-2 text-sm">
            判定：<b>{VERDICTS.find((v) => v.v === d.verdict)?.label}</b>
            {d.inspectorNote && <span className="ml-2 text-xs text-[var(--sb-ink-60)]">批注：{d.inspectorNote}</span>}
          </p>
        )}
      </div>

      {/* 证据墙：按清单项分组 */}
      <div className="mt-4 space-y-3">
        {[...d.template.items, ...(d.evidences.some((e: any) => e.itemCode === "factory_seal") && !d.template.items.some((i: any) => i.code === "factory_seal") ? [{ code: "factory_seal", labelZh: "质检报告盖章回传", labelEn: "Signed report", guideZh: "", media: "any" as const, required: true, minCount: 1 }] : [])].map((it: any) => {
          const evs = d.evidences.filter((e: any) => e.itemCode === it.code);
          return (
            <div key={it.code} className="rounded-xl border border-[var(--sb-line)] bg-white p-4">
              <p className="text-sm font-semibold">
                {it.required && <span className="text-[#b00020]">* </span>}
                {it.labelZh}
                <span className="ml-2 text-xs font-normal text-[var(--sb-ink-40)]">{evs.length} 件</span>
              </p>
              {evs.length === 0 && <p className="mt-2 text-xs text-[var(--sb-ink-40)]">（未上传）</p>}
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {evs.map((e: any) => (
                  <button key={e.id} onClick={() => setPreview(`/api/qc/file/${e.id}`)} className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--sb-line)] bg-black/5">
                    {e.mediaType === "photo" ? (
                      <img src={`/api/qc/file/${e.id}`} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-2xl">{e.mediaType === "video" ? "🎬" : "📄"}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 二检实测 */}
      {d.phase === 2 && (
        <div className="mt-4 rounded-xl border border-[var(--sb-line)] bg-white p-4">
          <p className="text-sm font-semibold">入仓实测（第二段账单出账依据，买家可见）</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <input value={kg} onChange={(e) => setKg(e.target.value)} placeholder="重量 kg" className="w-28 rounded-lg border border-[var(--sb-line)] px-2.5 py-1.5 text-xs" />
            <input value={cbm} onChange={(e) => setCbm(e.target.value)} placeholder="体积 m³" className="w-28 rounded-lg border border-[var(--sb-line)] px-2.5 py-1.5 text-xs" />
            <button
              onClick={() => measureM.mutate({ reportId, weightKg: Number(kg), volumeCbm: Number(cbm) })}
              disabled={!Number(kg) || !Number(cbm) || measureM.isPending}
              className="rounded-lg bg-[var(--sb-brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              保存实测
            </button>
            {d.measuredWeightKg && <span className="text-xs text-[var(--sb-ink-60)]">已录：{d.measuredWeightKg} kg / {d.measuredVolumeCbm} m³</span>}
          </div>
        </div>
      )}

      {/* 判定区 */}
      {d.status === "pending_review" && (
        <div className="mt-4 rounded-xl border border-[#e9d5a1] bg-[#fdf6e3] p-4">
          <p className="text-sm font-semibold text-[#92610a]">人工判定（AI 只预检，判定权在你）</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {VERDICTS.map((v) => (
              <button
                key={v.v}
                onClick={() => setVerdict(v.v)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity ${v.cls} ${verdict === v.v ? "ring-2 ring-black/30" : "opacity-70"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="批注（对买家可见；让步接收/返工/拒收必须写清原因）"
            className="mt-2.5 w-full rounded-lg border border-[var(--sb-line)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--sb-brand)]"
          />
          <button
            onClick={() => verdict && reviewM.mutate({ reportId, verdict: verdict as any, note: note.trim() || undefined })}
            disabled={!verdict || reviewM.isPending || ((verdict === "rework" || verdict === "reject" || verdict === "conditional") && !note.trim())}
            className="mt-2.5 w-full rounded-xl bg-[var(--sb-brand)] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {reviewM.isPending ? "提交中…" : "确认判定"}
          </button>
        </div>
      )}

      {/* 后续动作 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {d.status === "rework" && (
          <button onClick={() => reopenM.mutate({ reportId })} disabled={reopenM.isPending} className="rounded-lg bg-[#b06400] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
            返工完成，重新开放上传（换令牌）
          </button>
        )}
        {d.status === "passed" && d.phase === 1 && (
          <button onClick={() => signM.mutate({ reportId })} disabled={signM.isPending} className="rounded-lg bg-[#0a7a30] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
            确认工厂盖章回传（触发 60% 货款节点）
          </button>
        )}
        {d.verdict && (
          <a href={`/api/qc/${d.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--sb-line)] px-4 py-2 text-xs font-semibold hover:border-[var(--sb-brand)]">
            查看/重生成 PDF 报告
          </a>
        )}
      </div>
      {(reviewM.isError || reopenM.isError || signM.isError || measureM.isError) && (
        <p className="mt-3 text-sm text-[#b00020]">操作失败：{(reviewM.error ?? reopenM.error ?? signM.error ?? measureM.error)?.message}</p>
      )}
      {reopenM.isSuccess && reopenM.data.ok && (
        <p className="mt-3 select-all break-all rounded-lg bg-[var(--sb-paper)] px-3 py-2 text-xs">新上传链接：<code>{`${location.origin}/qc/${reopenM.data.token}`}</code></p>
      )}

      {/* 大图预览 */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(null)}>
          <EvidenceViewer src={preview} />
        </div>
      )}
    </div>
  );
}

function EvidenceViewer({ src }: { src: string }) {
  // 文件类型从响应猜不到，统一试 <img>，失败退 <video>，再退下载链接
  const [mode, setMode] = useState<"img" | "video" | "link">("img");
  if (mode === "img") return <img src={src} alt="" onError={() => setMode("video")} className="max-h-full max-w-full rounded-lg object-contain" />;
  if (mode === "video") return <video src={src} controls autoPlay onError={() => setMode("link")} className="max-h-full max-w-full rounded-lg" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-6 py-3 text-sm font-semibold" onClick={(e) => e.stopPropagation()}>
      打开/下载文件
    </a>
  );
}
