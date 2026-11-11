// M5 订单管理：全量订单台账 + 状态筛选 + 运营状态推进（走 transitionOrder 状态机，非法流转会被拒）。
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { ADM, Eyebrow, Empty, fmtUsd, fmtTime } from "./ui";
import { NEXT_ALLOWED, type OrderStatus } from "@contracts/orderFlow";

// 管理端固定中文（不走 i18n）；与 src/i18n/zh.ts orders.status 保持一致
const STATUS_LABEL_ZH: Record<string, string> = {
  inquiry: "询价中", quoted: "已报价", pending_payment: "待付款", sourcing: "采购中",
  producing: "生产中", goods_ready: "已报完工", insp1_uploading: "一检取证中", insp1_review: "一检判定中",
  insp1_passed: "一检合格", shipped: "已发货", in_warehouse: "已到仓", insp2_review: "二检判定中",
  insp2_passed: "二检合格", awaiting_phase2_pay: "待付运费尾款", phase2_paid: "运费已付",
  dispatched: "已发运", received: "已收货", cancelled: "已取消",
};

export default function AdminOrders() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const utils = trpc.useUtils();
  const q = trpc.admin.orders.useQuery({ status });
  const act = trpc.admin.orderAct.useMutation({
    onSuccess: () => utils.admin.orders.invalidate(),
    onError: (e) => alert(`状态流转失败：${e.message}`),
  });

  return (
    <div>
      <Eyebrow>ORDERS</Eyebrow>
      <h1 className="sb-display" style={{ fontSize: 34, margin: "8px 0 0", color: ADM.ink }}>订单管理</h1>

      {/* 状态筛选：文本式 tab */}
      <div style={{ display: "flex", gap: 16, marginTop: 22, flexWrap: "wrap" }}>
        <FilterBtn active={!status} onClick={() => setStatus(undefined)}>全部</FilterBtn>
        {(["inquiry", "quoted", "pending_payment", "sourcing", "producing", "goods_ready", "dispatched", "received", "cancelled"] as const).map((s) => (
          <FilterBtn key={s} active={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL_ZH[s] ?? s}</FilterBtn>
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1.4fr 1.2fr 90px 130px 150px", gap: 14, paddingBottom: 8, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: ADM.ink40, borderBottom: `1px solid ${ADM.ink}` }}>
          <div>单号</div><div>商品 / 买家</div><div>状态</div><div style={{ textAlign: "right" }}>GMV</div><div style={{ textAlign: "right" }}>创建时间</div><div>推进到</div>
        </div>
        {q.isLoading ? <Empty text="载入中…" /> : q.error ? <Empty text={`数据拉取失败：${q.error.message}`} /> :
          q.data!.length === 0 ? <Empty text="该状态下没有订单。" /> : (
            q.data!.map((o: any) => {
              const nexts = NEXT_ALLOWED[o.status as OrderStatus] ?? [];
              return (
                <div key={o.id} style={{ display: "grid", gridTemplateColumns: "120px 1.4fr 1.2fr 90px 130px 150px", gap: 14, padding: "11px 0", borderBottom: `1px solid ${ADM.line}`, fontSize: 13, alignItems: "center" }}>
                  <div className="sb-num" style={{ color: ADM.brand }}>{o.order_no}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.product_title || "文字需求"}{o.quantity ? ` ×${o.quantity}` : ""}</div>
                    <div style={{ fontSize: 12, color: ADM.ink40, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.email}{o.destination ? ` · ${o.destination}` : ""}</div>
                  </div>
                  <div style={{ color: ADM.ink60 }}>
                    {STATUS_LABEL_ZH[o.status as OrderStatus] ?? o.status}
                    {o.accepted_at && <div className="sb-num" style={{ fontSize: 11, color: ADM.ink40 }}>接受 {fmtTime(o.accepted_at)}</div>}
                  </div>
                  <div className="sb-num" style={{ textAlign: "right", fontWeight: 600 }}>{o.gmv_usd ? fmtUsd(Number(o.gmv_usd)) : "—"}</div>
                  <div className="sb-num" style={{ textAlign: "right", color: ADM.ink40 }}>{fmtTime(o.created_at)}</div>
                  <div>
                    {nexts.length === 0 ? <span style={{ fontSize: 12, color: ADM.ink40 }}>终态</span> : (
                      <select
                        value=""
                        onChange={(e) => {
                          const to = e.target.value;
                          if (!to) return;
                          if (confirm(`确认把 ${o.order_no} 推进到「${STATUS_LABEL_ZH[to as OrderStatus] ?? to}」？`)) {
                            act.mutate({ orderId: o.id, to });
                          }
                        }}
                        style={{ fontSize: 12, border: `1px solid ${ADM.line}`, background: "transparent", padding: "5px 6px", color: ADM.ink, width: "100%" }}
                      >
                        <option value="">选择下一状态…</option>
                        {nexts.map((n) => <option key={n} value={n}>{STATUS_LABEL_ZH[n] ?? n}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              );
            })
          )}
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none", padding: "4px 0", cursor: "pointer", fontSize: 13,
        color: active ? ADM.ink : ADM.ink40, fontWeight: active ? 600 : 400,
        borderBottom: active ? `2px solid ${ADM.brand}` : "2px solid transparent",
      }}
    >
      {children}
    </button>
  );
}
