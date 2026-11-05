// M3b 订单状态机——前后端共享的单一事实源
// 冻结口径（2026-11-05）：询价 → 已报价 → 待付款 → 采购中 → 质检 → 发货 → 收货；任何节点可取消（收货后不可）
// 待付款阶段支付能力挂"即将开通"诚实标注（OnlyPay 凭证未到，见 M6），买家可确认报价表达意向

export const ORDER_STATUSES = [
  "inquiry",
  "quoted",
  "pending_payment",
  "sourcing",
  "inspecting",
  "shipped",
  "received",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// 主流程顺序（cancelled 是旁路，不在主轴上）
export const ORDER_FLOW: readonly OrderStatus[] = [
  "inquiry",
  "quoted",
  "pending_payment",
  "sourcing",
  "inspecting",
  "shipped",
  "received",
];

// 允许的流转表——不在表里的流转一律拒绝（状态机没有后门）
export const NEXT_ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  inquiry: ["quoted", "cancelled"],
  quoted: ["pending_payment", "cancelled"],
  pending_payment: ["sourcing", "cancelled"],
  sourcing: ["inspecting", "cancelled"],
  inspecting: ["shipped"],
  shipped: ["received"],
  received: [],
  cancelled: [],
};

// 买家在前台能发起的流转（其余只能由运营侧驱动）
export const BUYER_TRANSITIONS: Record<string, { from: OrderStatus; to: OrderStatus }> = {
  confirmQuote: { from: "quoted", to: "pending_payment" },
  confirmReceive: { from: "shipped", to: "received" },
  cancel: { from: "inquiry", to: "cancelled" }, // 另允许 quoted→cancelled，在代码里特判
};

// 报价单快照结构——报价一旦给出即冻结，不随后台数据漂移
export interface OrderQuote {
  exwUnitPriceCny?: number; // 出厂单价（人民币）
  goodsTotalCny?: number; // 货值合计（佣金基数，不含运费）
  freightUsd?: number;
  dutyUsd?: number;
  commissionUsd?: number;
  commissionRate?: number; // 0.035–0.11，来自冻结费率矩阵
  totalUsd?: number;
  fxRate?: number; // 结汇汇率（牌价 − 0.3）
  channel?: string; // 运输渠道
  etaDays?: string; // 参考时效
  minFeeApplied?: boolean; // 触发最低收费 $50
  note?: string; // 老采购备注（风险提示等）
  quotedAt: string; // ISO 时间
}
