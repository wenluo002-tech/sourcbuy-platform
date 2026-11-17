// 探源引擎文案单一事实源（词条表 v1.0，2026-11-17 罗总终审生效）
// Owner：罗总终审。任何词条改动须经 owner 批准，本文件是唯一事实源——前台文案、QA 扫描、报告模板全从这里读。
// 硬卡点：db/qa-copy-scan.ts 以本文件为基准扫描六语言字典，命中禁用词/内部数字/两档误用即 FAIL，不允许存版本。
// 状态：zh/en 已终审可直接用；es/fr/pt/ka 为初译，上线前须母语者盲审抽检（词条表 v1.0 附挂账）。

// ─── A. 两档命名（全站锁死，禁变体）───
export const TIER_LABELS = {
  // 严选直供：可立即询价档
  vettedDirect: {
    zh: "严选直供",
    en: "Vetted Direct",
    es: "Directo Verificado",
    fr: "Direct Vérifié",
    pt: "Direto Verificado",
    ka: "შემოწმებული პირდაპირი",
  },
  // 探源入围：已人工核验、可议价档
  sourcedVerified: {
    zh: "探源入围",
    en: "Sourced & Verified",
    es: "Seleccionado y Verificado",
    fr: "Sourcé et Vérifié",
    pt: "Selecionado e Verificado",
    ka: "მოძიებული და შემოწმებული",
  },
} as const;

// 四语待母语盲审（上线前必须闭环）；zh/en 已终审
export const PENDING_NATIVE_REVIEW = ["es", "fr", "pt", "ka"] as const;

export const TIER_CTA = {
  vettedDirect: { zh: "立即询价", en: "Get a Quote" },
  sourcedVerified: { zh: "获取核验报告", en: "Get Verification Report" },
} as const;

// ─── B. 规模口径（唯一说法）───
export const SCALE_CLAIM = {
  vettedCount: { zh: "7,000+ 家严选工厂", en: "7,000+ vetted factories" },
  coverage: { zh: "覆盖中国主要产业带在产工厂", en: "covering active factories across China's major industrial belts" },
  // 「可探源档案」仅允许出现在 gap 场景（用户查不到时的引导），禁止用于 hero/常规介绍
  gapOnly: { zh: "可探源档案", en: "traceable profiles" },
} as const;

// 内部台账数字（永不进前台，QA 反向扫描命中即 FAIL）
export const INTERNAL_NUMBER_PATTERNS: RegExp[] = [
  /8[,，]?682/,
  /7[,，]?760/,
  /480\s*万/,
  /4\.8\s*million/i,
];

// ─── C. 时效话术：品类 SLA 表（{N} 只从这里读，禁止硬编码小时数进前台）───
// 建材桶为首发实证品类，第一行必须来自实测数据；未跑通的品类前台显示「预计时效」不显示倒计时。
export interface CategorySla {
  categoryKey: string; // 品类桶 key
  slaHours: number; // 实测承诺时效（小时）
  measuredFrom: string; // 实测依据（报告编号/日期）
}
export const CATEGORY_SLA: CategorySla[] = [
  // 待建材桶实测数据回填——回填前任何品类不得显示承诺时效，只显示「预计时效」
];
export const SLA_FALLBACK_COPY = { zh: "预计时效", en: "Estimated turnaround" } as const;

// ─── D. 禁用词清单（QA 硬卡点，命中即 FAIL）───
export interface ForbiddenTerm {
  pattern: RegExp; // 大小写不敏感统一在扫描侧处理
  reason: string;
}
export const FORBIDDEN_TERMS: ForbiddenTerm[] = [
  { pattern: /合作工厂|partner\s+factor/i, reason: "暗示与卖方合作，违只站买方铁律" },
  { pattern: /全球探源|global\s+sourcing\s+network/i, reason: "超出实际覆盖，夸大宣传" },
  { pattern: /认证工厂|certified\s+factor/i, reason: "我方非认证机构" },
  { pattern: /源头直供|厂家直供|factory[- ]?direct/i, reason: "探源入围厂禁用，误导确定性" },
  { pattern: /独家|exclusive/i, reason: "无法证实且易引发排他性误解" },
  { pattern: /最便宜|最低价|best\s+price|lowest\s+price/i, reason: "绝对化用语" },
  { pattern: /100%\s*(正品|genuine)/i, reason: "绝对化承诺" },
  { pattern: /1688|阿里巴巴|alibaba/i, reason: "上游平台品牌名前台禁露" },
  { pattern: /天下工厂|TXGC/i, reason: "内部数据源名禁露" },
];

// 「直供」只允许作为完整名词「严选直供」的组成部分出现；拆用即违规。
// 检测方式：抹掉所有「严选直供」后，残留「直供」即命中。英文对应 Vetted Direct 整体，不拆分检测。
export const ZHIGONG_FULL = "严选直供";
export const ZHIGONG_FRAGMENT = "直供";

// ─── E. 免费露出话术（交付页仪式感模块）───
export const FREE_DELIVERY_COPY = {
  // 顶部温度提示语：按实际档位二选一（变量驱动，禁止写死）
  topNoteAiScreened: { zh: "本次探源已为您完成初筛，以下是入围名单。", en: "Initial screening completed for this sourcing request — here is the shortlist." },
  topNoteHumanVerified: { zh: "本次探源已为您完成人工核验，以下是入围名单。", en: "Human verification completed for this sourcing request — here is the shortlist." },
  // 底部固定位
  freeFooter: { zh: "本次探源免费", en: "This sourcing request is free of charge." },
} as const;
