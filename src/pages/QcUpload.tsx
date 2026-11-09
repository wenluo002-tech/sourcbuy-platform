// 工厂端质检证据上传页 /qc/:token（独立路由，不进 Layout，纯中文硬编码——给工厂质检工人用）
// 兼容性纪律（v53/v67 教训）：上传触发一律 label htmlFor 原生触发 + 视觉隐藏但存在于布局树的 input；
// iPhone 拍照默认 HEIC，canvas 双路径解码（createImageBitmap 优先，<img> 回退）转成 JPEG 再传。
import { useState } from "react";
import { useParams } from "react-router";
import { trpc } from "@/providers/trpc";

type Item = {
  code: string;
  labelZh: string;
  guideZh: string;
  media: "photo" | "video" | "any";
  required: boolean;
  minCount: number;
};

function acceptFor(media: Item["media"]): string {
  if (media === "video") return "video/*";
  if (media === "any") return "image/*,application/pdf";
  return "image/*";
}

// HEIC 双路径解码 → JPEG Blob（证据要看得清卡尺读数，最长边给 1920）
async function toJpegBlob(file: File): Promise<Blob> {
  const paint = (srcW: number, srcH: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Promise<Blob> => {
    const scale = Math.min(1, 1920 / Math.max(srcW, srcH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    draw(canvas.getContext("2d")!, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85),
    );
  };
  try {
    const bmp = await createImageBitmap(file);
    return await paint(bmp.width, bmp.height, (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h));
  } catch {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<Blob>((resolve, reject) => {
        const im = new Image();
        im.onload = async () => {
          URL.revokeObjectURL(url);
          if (!im.naturalWidth) return reject(new Error("empty"));
          try {
            resolve(await paint(im.naturalWidth, im.naturalHeight, (ctx, w, h) => ctx.drawImage(im, 0, 0, w, h)));
          } catch (e) {
            reject(e);
          }
        };
        im.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("decode failed"));
        };
        im.src = url;
      });
    } catch {
      // 两条解码路径都挂：原图直传（服务端按原始 mime 存，可能是 HEIC——留证总比丢证强）
      return file;
    }
  }
}

export default function QcUpload() {
  const { token } = useParams<{ token: string }>();
  const q = trpc.inspection.byToken.useQuery({ token: token ?? "" }, { enabled: !!token, retry: false });
  const submitM = trpc.inspection.submitByToken.useMutation({
    onSuccess: () => q.refetch(),
  });
  const [uploading, setUploading] = useState<string | null>(null); // 正在上传的 itemCode
  const [err, setErr] = useState<string | null>(null);

  const d = q.data;

  async function onPick(item: Item, file: File | null) {
    if (!file || !token) return;
    setErr(null);
    setUploading(item.code);
    try {
      let blob: Blob = file;
      let name = file.name;
      if (file.type.startsWith("image/") || /\.hei[cf]$/i.test(file.name)) {
        if (file.size > 30 * 1024 * 1024) throw new Error("照片太大了，别超过 30MB");
        blob = await toJpegBlob(file);
        name = "photo.jpg";
      } else if (file.type.startsWith("video/")) {
        if (file.size > 110 * 1024 * 1024) throw new Error("视频太大了，别超过 110MB（一镜到底 1 分钟内够了）");
      } else if (file.type !== "application/pdf") {
        throw new Error("只支持照片、视频或 PDF");
      }
      const fd = new FormData();
      fd.append("token", token);
      fd.append("itemCode", item.code);
      fd.append("file", new File([blob], name, { type: blob.type || file.type }));
      const r = await fetch("/api/qc/upload", { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error === "BAD_MEDIA" ? "这一项要求的文件类型不对" : j?.error === "TOO_LARGE" ? "文件太大" : "上传失败，再试一次");
      await q.refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上传失败，再试一次");
    } finally {
      setUploading(null);
    }
  }

  const missingCount = d && !d.expired ? d.template.items.filter((it) => it.required && (d.counts[it.code] ?? 0) < it.minCount).length : 0;

  return (
    <div className="min-h-screen bg-[#f5f4ef] pb-24">
      <div className="mx-auto max-w-lg px-4 py-6">
        {/* 头部 */}
        <div className="rounded-2xl bg-[#0f3d3e] p-5 text-white">
          <p className="text-[11px] opacity-70">SourcBuy 质检取证</p>
          <h1 className="mt-1 text-lg font-bold">
            {d && !d.expired ? (d.phase === 1 ? "出厂质检（一检）" : "入仓质检（二检）") : "质检取证"}
          </h1>
          {d && !d.expired && (
            <p className="mt-1 text-xs opacity-80">
              {d.reportNo} · 订单 {d.orderNo}
              {d.productTitle ? ` · ${d.productTitle.slice(0, 30)}` : ""}
              {d.quantity ? ` · ${d.quantity} 件` : ""}
            </p>
          )}
        </div>

        {q.isLoading && <p className="py-16 text-center text-sm text-[#666]">加载中…</p>}
        {q.isError && <p className="py-16 text-center text-sm text-[#b00020]">链接无效——请联系 SourcBuy 跟单重新发链接</p>}
        {d?.expired && <p className="py-16 text-center text-sm text-[#b00020]">链接已过期——请联系 SourcBuy 跟单重新发链接（{d.reportNo}）</p>}

        {d && !d.expired && (
          <>
            {/* 状态横幅 */}
            {d.status === "pending_review" && (
              <div className="mt-4 rounded-xl bg-[#e7f0fd] p-4 text-sm text-[#1a4b8f]">✅ 证据已提交，SourcBuy 质检员判定中。判定结果会通知你们负责人。</div>
            )}
            {d.status === "rework" && (
              <div className="mt-4 rounded-xl bg-[#fdf6e3] p-4 text-sm text-[#92610a]">
                ⚠️ 判定：需要返工{d.inspectorNote ? `——${d.inspectorNote}` : ""}。返工完成后会重新开放上传，请等通知。
              </div>
            )}
            {d.status === "rejected" && (
              <div className="mt-4 rounded-xl bg-[#fdeaea] p-4 text-sm text-[#b00020]">
                ❌ 判定：不合格{d.inspectorNote ? `——${d.inspectorNote}` : ""}。SourcBuy 会联系你们负责人处置。
              </div>
            )}
            {(d.status === "passed" || d.status === "signed") && (
              <div className="mt-4 rounded-xl bg-[#e7f6ec] p-4 text-sm text-[#0a7a30]">
                ✅ 判定：{d.verdict === "conditional" ? "让步接收" : "合格"}！
                {d.phase === 1 && d.status === "passed" && " 还差最后一步：把质检报告打印盖章传回来（页面底部）。"}
                {d.status === "signed" && " 盖章回传已收到，等着收尾款发货。"}
              </div>
            )}
            {d.status === "uploading" && missingCount > 0 && (
              <div className="mt-4 rounded-xl bg-white p-4 text-sm text-[#333] shadow-sm">
                按下面清单逐项拍照/拍视频，<b>带 * 的是必拍项</b>。拍完点底部「提交」。
              </div>
            )}

            {err && <div className="mt-3 rounded-xl bg-[#fdeaea] p-3 text-sm text-[#b00020]">{err}</div>}

            {/* 清单项 */}
            <div className="mt-4 space-y-3">
              {d.template.items.map((it) => {
                const n = d.counts[it.code] ?? 0;
                const enough = n >= it.minCount;
                const busy = uploading === it.code;
                const canUpload = d.status === "uploading" || (d.status === "passed" && it.code === "factory_seal");
                return (
                  <div key={it.code} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        {it.required && <span className="text-[#b00020]">* </span>}
                        {it.labelZh}
                      </p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${enough ? "bg-[#e7f6ec] text-[#0a7a30]" : "bg-black/5 text-[#888]"}`}>
                        已传 {n}/{it.minCount}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#666]">{it.guideZh}</p>
                    {canUpload && (
                      <>
                        <input
                          id={`qc-${it.code}`}
                          type="file"
                          accept={acceptFor(it.media)}
                          className="sr-only"
                          disabled={busy}
                          onChange={(e) => {
                            void onPick(it, e.target.files?.[0] ?? null);
                            e.target.value = "";
                          }}
                        />
                        <label
                          htmlFor={`qc-${it.code}`}
                          className={`mt-3 block w-full rounded-xl border-2 border-dashed py-3.5 text-center text-sm font-semibold ${
                            busy
                              ? "border-[#0f3d3e]/30 text-[#999]"
                              : "border-[#0f3d3e] text-[#0f3d3e] active:bg-[#0f3d3e]/5"
                          }`}
                        >
                          {busy ? "上传中…" : it.media === "video" ? "🎬 拍视频 / 选视频" : "📷 拍照 / 选照片"}
                        </label>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 提交按钮（仅上传中状态） */}
            {d.status === "uploading" && (
              <button
                onClick={() => submitM.mutate({ token: token! })}
                disabled={missingCount > 0 || submitM.isPending}
                className="fixed inset-x-4 bottom-4 mx-auto max-w-lg rounded-2xl bg-[#0f3d3e] py-4 text-base font-bold text-white shadow-lg disabled:opacity-40"
              >
                {submitM.isPending ? "提交中…" : missingCount > 0 ? `还有 ${missingCount} 个必拍项没拍完` : "提交，等 SourcBuy 判定"}
              </button>
            )}
            {(d.status === "passed" || d.status === "signed") && (
              <a
                href={`/api/qc/${d.reportId}/pdf?token=${token}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block w-full rounded-2xl border border-[#0f3d3e] py-3.5 text-center text-sm font-semibold text-[#0f3d3e]"
              >
                下载质检报告 PDF（打印盖章用）
              </a>
            )}
            {submitM.isError && <p className="mt-3 text-center text-sm text-[#b00020]">提交失败，请检查必拍项后重试</p>}
          </>
        )}
      </div>
    </div>
  );
}
