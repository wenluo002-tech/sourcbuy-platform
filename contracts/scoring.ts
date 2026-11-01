// 严选评分体系——公开算法（费率矩阵 v1.0 §3.3 推荐中立条款的配套）
// 由 478 家完整子分工厂回归验证：综合分 = Σ(维度分 × 权重) + 基础分，误差 ≤0.05
export interface ScoreDimension {
  key: string;
  label: string;
  weight: number; // 0-1
  desc: string; // 这个维度看什么
}

export const SCORING_FORMULA: {
  dimensions: ScoreDimension[];
  baseScore: number;
  verifiedOn: number;
  maxError: number;
  note: string;
} = {
  dimensions: [
    { key: "qualityCert", label: "质量认证", weight: 0.15, desc: "第三方验厂与质量认证（SGS / Intertek 等）" },
    { key: "factoryPower", label: "工厂实力", weight: 0.15, desc: "厂房、设备、员工规模等硬实力" },
    { key: "trustYears", label: "诚信年限", weight: 0.12, desc: "1688 诚信通年限与持续经营历史" },
    { key: "repurchase", label: "复购率", weight: 0.12, desc: "老买家用订单投票——最真实的质量信号" },
    { key: "production", label: "生产产能", weight: 0.1, desc: "产能规模与交付稳定性" },
    { key: "service", label: "服务响应", weight: 0.1, desc: "询盘响应速度、售后与纠纷处理" },
    { key: "sales", label: "销售表现", weight: 0.13, desc: "平台成交额与市场热度" },
  ],
  baseScore: 3.9,
  verifiedOn: 478,
  maxError: 0.05,
  note: "综合评分 = 七个维度加权求和 + 基础分。维度分 0-100，综合分约 60-95。权重公开、不可购买、不接受工厂付费调分。",
};
