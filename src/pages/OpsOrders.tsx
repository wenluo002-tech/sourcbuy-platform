// 运营质检工作台 /ops（内部工具，中文硬编码）：可操作订单 + 报告列表
// 闸：inspection.* 走 opsQuery（OPS_ADMIN_EMAILS 白名单），非白名单一律 FORBIDDEN
import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";

const INSP_STATUS_ZH: Record<string, string> = {
  uploading: "上传中",
  pending_review: "待判定",
  passed: "已通过",
  rework: "返工重传",
  rejected: "未通过",
  signed: "已签章",
};

const ORDER_STATUS_ZH: Record<string, string> = {
  producing: "生产中",
  goods_ready: "已报完工",
  insp1_uploading: "一检上传中",
  insp1_review: "一检判定中",
  in_warehouse: "已到仓",
  insp2_review: "二检判定中",
};

export default function OpsOrders() {
  const { me, loading } = useAuth();
  const [tab, setTab] = useState<"review" | "orders">("review");
  const [template, setTemplate] = useState<Record<number, string>>({});
  const utils = trpc.useUtils();
  const listQ = trpc.inspection.list.useQuery({}, { enabled: !!me, retry: false });
  const ordersQ = trpc.inspection.actionable.useQuery(undefined, { enabled: !!me, retry: false });
  const createM = trpc.inspection.create.useMutation({
    onSuccess: () => {
      void listQ.refetch();
      void ordersQ.refetch();
    },
  });

  if (loading) return null;
  if (!me) return <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm">请先登录运营账号</p>;
  if (listQ.error?.data?.code === "FORBIDDEN" || ordersQ.error?.data?.code === "FORBIDDEN")
    return <p className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[#b00020]">无运营权限（OPS_ADMIN_EMAILS 白名单）</p>;

  const reports = listQ.data ?? [];
  const pending = reports.filter((r) => r.status === "pending_review");
  const shown = tab === "review" ? [...pending, ...reports.filter((r) => r.status !== "pending_review")] : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-lg font-bold">质检工作台</h1>
      <p className="mt-1 text-xs text-[var(--sb-ink-40)]">一检 = 完工出货检（工厂自拍证据）· 二检 = 入仓检（实测出账）· 判定权永远在人，AI 只预检</p>

      <div className="mt-4 flex gap-2 text-sm">
        <button
          onClick={() => setTab("review")}
          className={`rounded-full px-4 py-1.5 font-medium ${tab === "review" ? "bg-[var(--sb-brand)] text-white" : "border border-[var(--sb-line)]"}`}
        >
          报告判定{pending.length > 0 ? `（${pending.length} 待判定）` : ""}
        </button>
        <button
          onClick={() => setTab("orders")}
          className={`rounded-full px-4 py-1.5 font-medium ${tab === "orders" ? "bg-[var(--sb-brand)] text-white" : "border border-[var(--sb-line)]"}`}
        >
          开报告（可操作订单）
        </button>
      </div>

      {tab === "review" && (
        <div className="mt-4 space-y-2.5">
          {shown.length === 0 && <p className="py-12 text-center text-sm text-[var(--sb-ink-40)]">暂无质检报告</p>}
          {shown.map((r: any) => (
            <Link
              key={r.id}
              to={`/ops/qc/${r.id}`}
              className="flex items-center justify-between rounded-xl border border-[var(--sb-line)] bg-white p-4 hover:border-[var(--sb-brand)]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {r.reportNo}
                  <span className="ml-2 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium">{r.phase === 1 ? "一检" : "二检"}</span>
                  <span className="ml-2 text-xs font-normal text-[var(--sb-ink-40)]">{r.orderNo}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-[var(--sb-ink-60)]">{r.productTitle ?? "（无商品快照）"}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  r.status === "pending_review"
                    ? "bg-[#fdf6e3] text-[#92610a]"
                    : r.status === "passed" || r.status === "signed"
                      ? "bg-[#e7f6ec] text-[#0a7a30]"
                      : r.status === "rejected"
                        ? "bg-[#fdeaea] text-[#b00020]"
                        : "bg-black/5 text-[var(--sb-ink-60)]"
                }`}
              >
                {INSP_STATUS_ZH[r.status] ?? r.status}
              </span>
            </Link>
          ))}
        </div>
      )}

      {tab === "orders" && (
        <div className="mt-4 space-y-2.5">
          {(ordersQ.data ?? []).length === 0 && <p className="py-12 text-center text-sm text-[var(--sb-ink-40)]">暂无可操作订单（需订单到「已报完工/已到仓」）</p>}
          {(ordersQ.data ?? []).map((o: any) => (
            <div key={o.id} className="rounded-xl border border-[var(--sb-line)] bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {o.orderNo}
                  <span className="ml-2 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium">{ORDER_STATUS_ZH[o.status] ?? o.status}</span>
                </p>
                <span className="text-xs text-[var(--sb-ink-40)]">{o.quantity ? `${o.quantity} 件` : ""}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--sb-ink-60)]">{o.productTitle ?? "（无商品快照）"}</p>
              {o.reports.length > 0 && (
                <p className="mt-1.5 text-[11px] text-[var(--sb-ink-40)]">
                  已有报告：
                  {o.reports.map((r: any) => (
                    <Link key={r.id} to={`/ops/qc/${r.id}`} className="mr-2 text-[var(--sb-brand)] hover:underline">
                      {r.reportNo}({r.phase === 1 ? "一检" : "二检"}·{INSP_STATUS_ZH[r.status]})
                    </Link>
                  ))}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {o.status === "goods_ready" && (
                  <>
                    <select
                      value={template[o.id] ?? "generic"}
                      onChange={(e) => setTemplate((s) => ({ ...s, [o.id]: e.target.value }))}
                      className="rounded-lg border border-[var(--sb-line)] px-2 py-1.5 text-xs"
                    >
                      <option value="generic">通用基础检</option>
                      <option value="baluster_ss">不锈钢立柱/栏杆</option>
                    </select>
                    <button
                      onClick={() => createM.mutate({ orderId: o.id, phase: 1, template: template[o.id] ?? "generic" })}
                      disabled={createM.isPending}
                      className="rounded-lg bg-[var(--sb-brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      开一检报告
                    </button>
                  </>
                )}
                {o.status === "in_warehouse" && (
                  <button
                    onClick={() => createM.mutate({ orderId: o.id, phase: 2, template: "generic" })}
                    disabled={createM.isPending}
                    className="rounded-lg bg-[var(--sb-brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    开二检报告
                  </button>
                )}
                {(o.status === "insp1_uploading" || o.status === "insp1_review" || o.status === "insp2_review" || o.status === "producing") && (
                  <span className="text-[11px] text-[var(--sb-ink-40)]">流程进行中，到左侧「报告判定」处理</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {createM.isSuccess && createM.data.ok && (
        <div className="fixed inset-x-4 bottom-4 mx-auto max-w-2xl rounded-xl bg-[#0f3d3e] p-4 text-sm text-white shadow-xl">
          报告已创建 {createM.data.reportNo}，工厂上传链接：
          <code className="ml-1 select-all rounded bg-white/15 px-1.5 py-0.5 text-xs">{`${location.origin}/qc/${createM.data.token}`}</code>
        </div>
      )}
      {createM.isError && <p className="mt-3 text-sm text-[#b00020]">创建失败：{createM.error.message}</p>}
      {utils && null}
    </div>
  );
}
