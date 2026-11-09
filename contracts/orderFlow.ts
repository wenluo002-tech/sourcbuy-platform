// M3b 订单状态机——前后端共享的单一事实源
// 2026-11-09 扩展（质检双检 PRD v1.1 罗总拍板）：
//   询价 → 已报价 → 待付款 → 采购中 → 生产中 → 已报完工 → 一检上传 → 一检判定 → 一检合格
//   → 工厂发货 → 已到仓 → 二检判定 → 二检合格 → 待付运费 → 已付运费 → 已发运 → 已签收；任何节点可取消（收货后不可）
// 买家前台进度条按 STATUS_GROUP 折叠成 7 组展示，运营侧用完整 17 态；待付款阶段支付能力挂"即将开通"诚实标注（OnlyPay 凭证未到，见 M6）

export const ORDER_STATUSES = [
  "inquiry",
  "quoted",
  "pending_payment",
  "sourcing",
  "producing",
  "goods_ready",
  "insp1_uploading",
  "insp1_review",
  "insp1_passed",
  "shipped",
  "in_warehouse",
  "insp2_review",
  "insp2_passed",
  "awaiting_phase2_pay",
  "phase2_paid",
  "dispatched",
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
  "producing",
  "goods_ready",
  "insp1_uploading",
  "insp1_review",
  "insp1_passed",
  "shipped",
  "in_warehouse",
  "insp2_review",
  "insp2_passed",
  "awaiting_phase2_pay",
  "phase2_paid",
  "dispatched",
  "received",
];

// 允许的流转表——不在表里的流转一律拒绝（状态机没有后门）
// 一检返工=insp1_review 回 producing；二检不合格不走状态回退，停 insp2_review 走异常处置+事件留痕
export const NEXT_ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  inquiry: ["quoted", "cancelled"],
  quoted: ["pending_payment", "cancelled"],
  pending_payment: ["sourcing", "cancelled"],
  sourcing: ["producing", "goods_ready", "cancelled"], // 现货单可直接报完工
  producing: ["goods_ready"],
  goods_ready: ["insp1_uploading"],
  insp1_uploading: ["insp1_review"],
  insp1_review: ["insp1_passed", "producing"],
  insp1_passed: ["shipped"],
  shipped: ["in_warehouse"],
  in_warehouse: ["insp2_review"],
  insp2_review: ["insp2_passed"],
  insp2_passed: ["awaiting_phase2_pay"],
  awaiting_phase2_pay: ["phase2_paid"],
  phase2_paid: ["dispatched"],
  dispatched: ["received"],
  received: [],
  cancelled: [],
};

// 买家前台 7 组折叠（组 id 复用既有 i18n 键，组内精确状态由 status label 展示）
export type OrderGroup = "inquiry" | "quoted" | "pending_payment" | "sourcing" | "inspecting" | "shipped" | "received" | "cancelled";
export const STATUS_GROUP: Record<OrderStatus, OrderGroup> = {
  inquiry: "inquiry",
  quoted: "quoted",
  pending_payment: "pending_payment",
  sourcing: "sourcing",
  producing: "sourcing",
  goods_ready: "sourcing",
  insp1_uploading: "inspecting",
  insp1_review: "inspecting",
  insp1_passed: "inspecting",
  shipped: "shipped",
  in_warehouse: "shipped",
  insp2_review: "shipped",
  insp2_passed: "shipped",
  awaiting_phase2_pay: "shipped",
  phase2_paid: "shipped",
  dispatched: "shipped",
  received: "received",
  cancelled: "cancelled",
};
export const GROUP_FLOW: readonly OrderGroup[] = [
  "inquiry",
  "quoted",
  "pending_payment",
  "sourcing",
  "inspecting",
  "shipped",
  "received",
];

// 已付款状态集（权益锁解锁判定用，从主轴派生，绝不另写一份硬编码清单）
export const PAID_STATUSES: readonly OrderStatus[] = ORDER_FLOW.slice(ORDER_FLOW.indexOf("sourcing"));

// 买家在前台能发起的流转（其余只能由运营侧驱动）
export const BUYER_TRANSITIONS: Record<string, { from: OrderStatus; to: OrderStatus }> = {
  confirmQuote: { from: "quoted", to: "pending_payment" },
  confirmReceive: { from: "dispatched", to: "received" },
  cancel: { from: "inquiry", to: "cancelled" }, // 另允许 quoted/pending_payment→cancelled，在代码里特判
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
