// ═══ 双检质检模块单一事实源（2026-11-09 PRD v1.1，罗总拍板）═══
// 一检=完工后出货检（工厂端扫码 H5 上传）；二检=入仓检（仓库工作台）。
// 铁律：AI 只做预检，判定权永远在我方质检员；报告由人签章。
// 本文件是唯一允许定义清单模板/状态/判定/赔付规则的地方，前后端共用，没有后门。

// 报告状态机：uploading（工厂上传中）→ pending_review（待我方判定）
//   → passed / rework（打回返工，可重新上传）/ rejected（拒收）
//   → signed（工厂对合格报告盖章回传，触发 60% 货款节点）
export const INSP_STATUSES = ["uploading", "pending_review", "passed", "rework", "rejected", "signed"] as const;
export type InspStatus = (typeof INSP_STATUSES)[number];

// 人工判定四选一：合格 / 让步接收 / 返工 / 拒收
export const INSP_VERDICTS = ["pass", "conditional", "rework", "reject"] as const;
export type InspVerdict = (typeof INSP_VERDICTS)[number];

// 阶段：1=完工出货检（工厂端）；2=入仓检（仓库端）
export type InspPhase = 1 | 2;

export interface ChecklistItem {
  code: string; // 清单项编码（证据关联键，稳定不改）
  labelZh: string; // 工厂端显示名
  labelEn: string; // 买家报告用
  guideZh: string; // 拍摄指引（给文化水平不高的质检工人看，说人话）
  media: "photo" | "video" | "any"; // any=照片或文件(PDF)
  required: boolean;
  minCount: number; // 最少几件证据
}

export interface ChecklistTemplate {
  id: string;
  nameZh: string;
  nameEn: string;
  items: ChecklistItem[];
}

// 模板一：不锈钢立柱/栏杆（罗总 17 张验厂照片 + 光谱仪实测 + 青拓材质单反推）
const BALUSTER_SS: ChecklistTemplate = {
  id: "baluster_ss",
  nameZh: "不锈钢立柱/栏杆",
  nameEn: "Stainless Steel Baluster",
  items: [
    { code: "batch_tag", labelZh: "批次牌同框照", labelEn: "Batch tag with goods", media: "photo", required: true, minCount: 1,
      guideZh: "把我们给的批次牌放在货物旁边一起拍，每托/每箱一张，批次牌上的字要拍清楚" },
    { code: "appearance", labelZh: "整体外观", labelEn: "Overall appearance", media: "photo", required: true, minCount: 2,
      guideZh: "立柱整体每个面拍一张，光线亮一点，不要逆光" },
    { code: "wall_thickness", labelZh: "壁厚实测", labelEn: "Wall thickness measurement", media: "photo", required: true, minCount: 3,
      guideZh: "用带表卡尺卡住管壁，拍清楚表盘读数；卡尺、工件、批次牌要在同一张照片里；每种规格至少测 3 件" },
    { code: "base_dim", labelZh: "底座宽/孔距实测", labelEn: "Base width & hole spacing", media: "photo", required: true, minCount: 2,
      guideZh: "卷尺拉直量底座宽度和孔距，拍清楚尺子上的刻度读数" },
    { code: "weld", labelZh: "焊缝特写", labelEn: "Weld close-up", media: "photo", required: false, minCount: 1,
      guideZh: "有焊缝的立柱必须拍焊缝特写；没有焊缝的不用拍" },
    { code: "surface", labelZh: "表面处理", labelEn: "Surface finish", media: "photo", required: true, minCount: 2,
      guideZh: "拉丝或镜面效果，整体一张+特写一张" },
    { code: "spectrometer", labelZh: "光谱仪材质实测", labelEn: "Spectrometer material test", media: "video", required: true, minCount: 1,
      guideZh: "拍一段视频别停：光谱仪探头贴住工件 → 屏幕读数拍全（要看到牌号那一行）→ 移到批次牌。一镜到底，中间别剪" },
    { code: "mtc", labelZh: "材质单（钢厂质保书）", labelEn: "Mill Test Certificate", media: "any", required: true, minCount: 1,
      guideZh: "钢厂的材质单整页拍全或传 PDF，要能看到炉号、牌号、规格、证书编号、质检章" },
    { code: "factory_qc", labelZh: "出厂检验单", labelEn: "Factory QC record", media: "any", required: false, minCount: 1,
      guideZh: "厂里自己的出厂检验记录，有就拍" },
    { code: "packing_count", labelZh: "装箱前数量全景", labelEn: "Quantity before packing", media: "photo", required: true, minCount: 1,
      guideZh: "装箱前把货摆开拍一张能数清件数的全景" },
  ],
};

// 模板二：通用基础检（其他品类先用这个兜底，后续按品类逐个加）
const GENERIC: ChecklistTemplate = {
  id: "generic",
  nameZh: "通用基础检",
  nameEn: "General Inspection",
  items: [
    { code: "batch_tag", labelZh: "批次牌同框照", labelEn: "Batch tag with goods", media: "photo", required: true, minCount: 1,
      guideZh: "把批次牌放在货物旁边一起拍，批次牌上的字要拍清楚" },
    { code: "appearance", labelZh: "整体外观", labelEn: "Overall appearance", media: "photo", required: true, minCount: 2,
      guideZh: "货物整体每个面拍一张，光线亮一点" },
    { code: "packing_count", labelZh: "装箱前数量全景", labelEn: "Quantity before packing", media: "photo", required: true, minCount: 1,
      guideZh: "装箱前拍一张能数清件数的全景" },
    { code: "packaging", labelZh: "外包装", labelEn: "Packaging", media: "photo", required: true, minCount: 1,
      guideZh: "装箱后拍外包装，唛头那一面要拍清楚" },
  ],
};

export const CHECKLIST_TEMPLATES: Record<string, ChecklistTemplate> = {
  baluster_ss: BALUSTER_SS,
  generic: GENERIC,
};

export function getTemplate(id: string): ChecklistTemplate {
  return CHECKLIST_TEMPLATES[id] ?? GENERIC;
}

// 工厂签章回传项（不在模板里，判定合格后单独追加到上传页）
export const FACTORY_SEAL_ITEM: ChecklistItem = {
  code: "factory_seal", labelZh: "质检报告盖章回传", labelEn: "Signed report", media: "any", required: true, minCount: 1,
  guideZh: "把质检报告打印出来盖上公章，拍照或扫描传上来",
};

// 必拍项齐套判定：counts = itemCode → 已上传件数
export function requiredSatisfied(templateId: string, counts: Record<string, number>): { ok: boolean; missing: string[] } {
  const t = getTemplate(templateId);
  const missing = t.items.filter((it) => it.required && (counts[it.code] ?? 0) < it.minCount).map((it) => it.code);
  return { ok: missing.length === 0, missing };
}

// ═══ 先行赔付规则（2026-11-09 罗总拍板，写进买家协议的口径）═══
export const COMPENSATION = {
  minUsd: 100, // 起赔额
  maxPerOrderUsd: 50000, // 单笔订单赔付封顶
  lineZh: "先行赔付：$100 起赔，单笔订单封顶 $50,000",
  lineEn: "SourcBuy-first compensation: from $100, capped at $50,000 per order",
} as const;

// 质检定价口径（拍板）：含在佣金内；特殊复杂性质检单独收费，报价时显式列出
export const QC_PRICING_NOTE = {
  zh: "双检服务费已含在履约佣金内；特殊复杂性质检（通电测试/破坏性抽检/驻厂检）单独报价",
  en: "Both inspections included in the service commission; specialized testing quoted separately",
} as const;

// 报告编号：SB-QC-00001
export function inspReportNo(id: number | bigint): string {
  return `SB-QC-${String(id).padStart(5, "0")}`;
}

// 阶段显示名
export const PHASE_LABEL = {
  1: { zh: "出厂质检（一检）", en: "Pre-shipment Inspection" },
  2: { zh: "入仓质检（二检）", en: "Warehouse Inspection" },
} as const;
