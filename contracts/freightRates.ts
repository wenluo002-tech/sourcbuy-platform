/**
 * 真实物流报价矩阵（2026-10-15 生效，报价币种 CNY）
 * 来源：用户提供的《智慧物流报价系统后台配置需求文档（最终精校版）》——真实渠道价格，
 * 替换此前的渠道均价估算（US/CA/MX/AU 四国）。其他国家仍走 freight.ts 均价估算并标注。
 *
 * 存疑处（已在报告中向用户确认）：
 * - 渠道 1/3/4 的"最低计费重"文档表述含"单件"字样（如"单件实重不足12KG按12KG计费"），
 *   按字面理解对多件的票会荒谬（500 件×12kg），引擎按"整票最低计费重"实现。
 * - 渠道 2 加拿大 150KG+ 档"70.00（原表疑似笔误）"按 70.00 采用。
 */

// ---------------- 基础类型 ----------------

export interface WeightBreak {
  minKg: number; // 该价格档的最低计费重
  prices: Record<string, number>; // zoneKey -> RMB/kg
}

export interface RealChannelDef {
  id: string;
  name: string;
  country: string[]; // ISO codes
  mode: "air" | "sea";
  ddp: boolean; // 包税
  splitHalf: boolean; // 分抛50%：计费重=(实重+材积重)/2
  rounding: 0.5 | 1 | null; // 进位到 0.5kg 或 1kg
  minShipmentKg: number; // 整票最低计费重
  divisor: number; // 材积除数（全部 6000，按文档第一节）
  zhuhaiWarehouse: boolean; // 珠海仓交仓内陆费 +0.5 元/KG
  customsFeeCny: number | null; // 报关费/票（美加墨 350）
  transitNote: string; // 时效参考
  speedTag?: "快船" | "普船"; // 海运子方案标签（供方案卡片分组展示）
}

// ---------------- 邮编分区 ----------------

/** 美国空派：邮编首数字分段 8-9 / 6-7 / 0-5 */
export function usAirZone(zip: string): string | null {
  const d = zip.trim()[0];
  if (d == null || !/\d/.test(d)) return null;
  if (d === "8" || d === "9") return "z89";
  if (d === "6" || d === "7") return "z67";
  return "z05";
}

/** 美国海派：邮编前两位 80-95 / 96-99 / 40-79 / 00-39 */
export function usSeaZone(zip: string): string | null {
  const m = zip.trim().match(/^(\d{2})/);
  if (!m) return null;
  const n = Number(m[1]);
  if (n >= 80 && n <= 95) return "z8095";
  if (n >= 96 && n <= 99) return "z9699";
  if (n >= 40 && n <= 79) return "z4079";
  return "z0039";
}

/** UPS-SCS：AR/TX/FL 附加费州判定（按邮编前三位范围） */
export function usUpsScsStateSurcharge(zip: string): boolean {
  const m = zip.trim().match(/^(\d{3})/);
  if (!m) return false;
  const p = Number(m[1]);
  const inRange = (a: number, b: number) => p >= a && p <= b;
  // AR 716-729；TX 750-799；FL 320-349
  return inRange(716, 729) || inRange(750, 799) || inRange(320, 349);
}

/** 澳洲海派：四位邮编分段 */
export function auZone(zip: string): string | null {
  const m = zip.trim().match(/^(\d{4})/);
  if (!m) return null;
  const n = Number(m[1]);
  if (n >= 1000 && n <= 3999) return "au1";
  if (n >= 4000 && n <= 4999) return "au2";
  if (n >= 5000 && n <= 5999) return "au3";
  if (n >= 6000 && n <= 6999) return "au4";
  return "auOther";
}

// ---------------- 渠道定义 ----------------

export const REAL_CHANNELS: RealChannelDef[] = [
  // —— 美国空派（DDP 包税，UPS 尾程）——
  {
    id: "us_air_econ", name: "美国空派 · 普货特惠线", country: ["US"], mode: "air", ddp: true,
    splitHalf: true, rounding: 0.5, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: false, customsFeeCny: 350, transitNote: "超 9 工作日未提取有赔付（SLA）",
  },
  {
    id: "us_air_fast", name: "美国空派 · 普货快线", country: ["US"], mode: "air", ddp: true,
    splitHalf: true, rounding: 0.5, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: false, customsFeeCny: 350, transitNote: "超 5 工作日未提取有赔付（SLA）",
  },
  {
    id: "us_air_battery", name: "美国空派 · 内电快线（接内置电池）", country: ["US"], mode: "air", ddp: true,
    splitHalf: true, rounding: 0.5, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: false, customsFeeCny: 350, transitNote: "超 8 工作日未提取有赔付（SLA）",
  },
  {
    id: "us_air_cosmetic", name: "美国空派 · 化妆品快线", country: ["US"], mode: "air", ddp: true,
    splitHalf: true, rounding: 0.5, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: false, customsFeeCny: 350, transitNote: "化妆品专线",
  },
  // —— UPS-SCS 空派 DDP（美国/加拿大）——
  {
    id: "ups_scs", name: "UPS-SCS 空派（DDP）", country: ["US", "CA"], mode: "air", ddp: true,
    splitHalf: false, rounding: null, minShipmentKg: 0, divisor: 6000,
    zhuhaiWarehouse: true, customsFeeCny: 350, transitNote: "整票计费，单件不限重、不进位",
  },
  // —— 美国海派包税（可 FBA）——
  {
    id: "us_sea_matson", name: "美国海派 · 美森限时（CLX）", country: ["US"], mode: "sea", ddp: true,
    splitHalf: false, rounding: 1, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: true, customsFeeCny: 200, transitNote: "快船时效最稳", speedTag: "快船",
  },
  {
    id: "us_sea_hede", name: "美国海派 · 合德快提（HEDE）", country: ["US"], mode: "sea", ddp: true,
    splitHalf: false, rounding: 1, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: true, customsFeeCny: 200, transitNote: "快船", speedTag: "快船",
  },
  {
    id: "us_sea_zim", name: "美国海派 · 以星定提（ZIM）", country: ["US"], mode: "sea", ddp: true,
    splitHalf: false, rounding: 1, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: true, customsFeeCny: 200, transitNote: "快船", speedTag: "快船",
  },
  {
    id: "us_sea_cosco", name: "美国海派 · 盐田定提（COSCO）", country: ["US"], mode: "sea", ddp: true,
    splitHalf: false, rounding: 1, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: true, customsFeeCny: 200, transitNote: "普船偏快", speedTag: "普船",
  },
  {
    id: "us_sea_cul", name: "美国海派 · 普船统配（CUL）", country: ["US"], mode: "sea", ddp: true,
    splitHalf: false, rounding: 1, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: true, customsFeeCny: 200, transitNote: "普船，价最低", speedTag: "普船",
  },
  // —— 墨西哥空派 ——
  {
    id: "mx_air_general", name: "墨西哥空派 · 普货", country: ["MX"], mode: "air", ddp: true,
    splitHalf: false, rounding: 1, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: true, customsFeeCny: 350, transitNote: "提取 4–6 工作日",
  },
  {
    id: "mx_air_special", name: "墨西哥空派 · 特货", country: ["MX"], mode: "air", ddp: true,
    splitHalf: false, rounding: 1, minShipmentKg: 12, divisor: 6000,
    zhuhaiWarehouse: true, customsFeeCny: 350, transitNote: "提取 4–6 工作日",
  },
  // —— 加拿大海运直航（包税）——
  {
    id: "ca_sea_yyc", name: "加拿大海运 · 卡尔加里交仓", country: ["CA"], mode: "sea", ddp: true,
    splitHalf: false, rounding: null, minShipmentKg: 10, divisor: 6000,
    zhuhaiWarehouse: false, customsFeeCny: 350, transitNote: "直航包税",
  },
  {
    id: "ca_sea_yyz", name: "加拿大海运 · 多伦多交仓", country: ["CA"], mode: "sea", ddp: true,
    splitHalf: false, rounding: null, minShipmentKg: 10, divisor: 6000,
    zhuhaiWarehouse: false, customsFeeCny: 350, transitNote: "直航包税",
  },
  // —— 澳洲海派（非 FBA）——
  {
    id: "au_sea", name: "澳洲海派", country: ["AU"], mode: "sea", ddp: true,
    splitHalf: false, rounding: 1, minShipmentKg: 0, divisor: 6000,
    zhuhaiWarehouse: false, customsFeeCny: null, transitNote: "整票计费",
  },
];

// EXX 海派快线：文档标注"暂停收货"，不上线，仅记录
export const SUSPENDED_CHANNELS = ["us_sea_exx（EXX 海派快线，暂停收货）"];

// ---------------- 价格矩阵（RMB/KG）----------------

/** 美国空派：breaks 12/50/100，zones z89/z67/z05 */
export const US_AIR_PRICES: Record<string, WeightBreak[]> = {
  us_air_econ: [
    { minKg: 100, prices: { z89: 59.5, z67: 59.5, z05: 59.5 } },
    { minKg: 50, prices: { z89: 63.5, z67: 65.5, z05: 65.5 } },
    { minKg: 12, prices: { z89: 65.5, z67: 68.5, z05: 68.5 } },
  ],
  us_air_fast: [
    { minKg: 100, prices: { z89: 64, z67: 64, z05: 64 } },
    { minKg: 50, prices: { z89: 70, z67: 70, z05: 69 } },
    { minKg: 12, prices: { z89: 73, z67: 73, z05: 72 } },
  ],
  us_air_battery: [
    { minKg: 100, prices: { z89: 61.5, z67: 61.5, z05: 61.5 } },
    { minKg: 50, prices: { z89: 67.5, z67: 67.5, z05: 67.5 } },
    { minKg: 12, prices: { z89: 70.5, z67: 70.5, z05: 70.5 } },
  ],
  us_air_cosmetic: [
    { minKg: 100, prices: { z89: 81.6, z67: 78.6, z05: 79.6 } },
    { minKg: 50, prices: { z89: 82.6, z67: 79.6, z05: 80.6 } },
    { minKg: 12, prices: { z89: 84.1, z67: 81.1, z05: 82.1 } },
  ],
};

/** UPS-SCS：breaks 150/201/301/501/1001，zones us/ca */
export const UPS_SCS_PRICES: Record<string, WeightBreak[]> = {
  us: [
    { minKg: 1001, prices: { any: 56 } },
    { minKg: 501, prices: { any: 57 } },
    { minKg: 301, prices: { any: 59 } },
    { minKg: 201, prices: { any: 60 } },
    { minKg: 150, prices: { any: 66 } },
  ],
  ca: [
    { minKg: 1001, prices: { any: 59 } },
    { minKg: 501, prices: { any: 60 } },
    { minKg: 301, prices: { any: 61 } },
    { minKg: 201, prices: { any: 63 } },
    { minKg: 150, prices: { any: 70 } },
  ],
};

/** 美国海派：breaks 12/71/100，zones z8095/z9699/z4079/z0039 */
export const US_SEA_PRICES: Record<string, WeightBreak[]> = {
  us_sea_matson: [
    { minKg: 100, prices: { z8095: 14.9, z9699: 16.8, z4079: 17.5, z0039: 18.6 } },
    { minKg: 71, prices: { z8095: 15.9, z9699: 17.8, z4079: 18.5, z0039: 19.6 } },
    { minKg: 12, prices: { z8095: 16.9, z9699: 18.8, z4079: 19.5, z0039: 20.6 } },
  ],
  us_sea_hede: [
    { minKg: 100, prices: { z8095: 12.3, z9699: 14.2, z4079: 14.9, z0039: 16 } },
    { minKg: 71, prices: { z8095: 13.3, z9699: 15.2, z4079: 15.9, z0039: 17 } },
    { minKg: 12, prices: { z8095: 14.3, z9699: 16.2, z4079: 16.9, z0039: 18 } },
  ],
  us_sea_zim: [
    { minKg: 100, prices: { z8095: 13.1, z9699: 15, z4079: 15.8, z0039: 16.8 } },
    { minKg: 71, prices: { z8095: 14.1, z9699: 16, z4079: 16.8, z0039: 17.8 } },
    { minKg: 12, prices: { z8095: 15.1, z9699: 17, z4079: 17.8, z0039: 18.8 } },
  ],
  us_sea_cosco: [
    { minKg: 100, prices: { z8095: 11.5, z9699: 13.4, z4079: 14.1, z0039: 15.2 } },
    { minKg: 71, prices: { z8095: 12.5, z9699: 14.4, z4079: 15.1, z0039: 16.2 } },
    { minKg: 12, prices: { z8095: 13.5, z9699: 15.4, z4079: 16.1, z0039: 17.2 } },
  ],
  us_sea_cul: [
    { minKg: 100, prices: { z8095: 11.2, z9699: 13.1, z4079: 13.8, z0039: 14.9 } },
    { minKg: 71, prices: { z8095: 12.2, z9699: 14.1, z4079: 14.8, z0039: 15.9 } },
    { minKg: 12, prices: { z8095: 13.2, z9699: 15.1, z4079: 15.8, z0039: 16.9 } },
  ],
};

/** 美国海派重货减价（比重=材积/实重，计费重 ≥100kg 时按档减 RMB/KG） */
export const US_SEA_REBATE: Array<{ minRatio: number; off: number }> = [
  { minRatio: 500, off: 2.0 },
  { minRatio: 400, off: 1.5 },
  { minRatio: 300, off: 1.0 },
  { minRatio: 200, off: 0.5 },
];

/** 墨西哥空派：breaks 21/50/100 */
export const MX_AIR_PRICES: Record<string, WeightBreak[]> = {
  mx_air_general: [
    { minKg: 100, prices: { any: 88 } },
    { minKg: 50, prices: { any: 89 } },
    { minKg: 21, prices: { any: 90.5 } },
  ],
  mx_air_special: [
    { minKg: 100, prices: { any: 98 } },
    { minKg: 50, prices: { any: 99 } },
    { minKg: 21, prices: { any: 130.5 } },
  ],
};

/** 加拿大海运：breaks 21/45/71/100/1000；YYC 交仓按派送区域，YYZ 交仓两个区域 */
export const CA_SEA_REGIONS: Record<string, string[]> = {
  ca_sea_yyc: ["温哥华", "卡尔加里", "温尼伯", "多伦多", "渥太华", "埃德蒙顿"],
  ca_sea_yyz: ["多伦多", "渥太华"],
};
export const CA_SEA_PRICES: Record<string, Record<string, WeightBreak[]>> = {
  ca_sea_yyc: {
    温哥华: [
      { minKg: 1000, prices: { any: 14.5 } }, { minKg: 100, prices: { any: 14.5 } },
      { minKg: 71, prices: { any: 15 } }, { minKg: 45, prices: { any: 15 } },
      { minKg: 21, prices: { any: 16 } },
    ],
    卡尔加里: [
      { minKg: 1000, prices: { any: 13.5 } }, { minKg: 100, prices: { any: 13.5 } },
      { minKg: 71, prices: { any: 14 } }, { minKg: 45, prices: { any: 14 } },
      { minKg: 21, prices: { any: 15 } },
    ],
    温尼伯: [
      { minKg: 1000, prices: { any: 15.8 } }, { minKg: 100, prices: { any: 15.8 } },
      { minKg: 71, prices: { any: 16.3 } }, { minKg: 45, prices: { any: 16.3 } },
      { minKg: 21, prices: { any: 17.3 } },
    ],
    多伦多: [
      { minKg: 1000, prices: { any: 15.9 } }, { minKg: 100, prices: { any: 15.9 } },
      { minKg: 71, prices: { any: 16.4 } }, { minKg: 45, prices: { any: 16.4 } },
      { minKg: 21, prices: { any: 17.4 } },
    ],
    渥太华: [
      { minKg: 1000, prices: { any: 16 } }, { minKg: 100, prices: { any: 16 } },
      { minKg: 71, prices: { any: 16.5 } }, { minKg: 45, prices: { any: 16.5 } },
      { minKg: 21, prices: { any: 17.5 } },
    ],
    埃德蒙顿: [
      { minKg: 1000, prices: { any: 13.6 } }, { minKg: 100, prices: { any: 13.6 } },
      { minKg: 71, prices: { any: 14.1 } }, { minKg: 45, prices: { any: 14.1 } },
      { minKg: 21, prices: { any: 15.1 } },
    ],
  },
  ca_sea_yyz: {
    多伦多: [
      { minKg: 1000, prices: { any: 12.9 } }, { minKg: 100, prices: { any: 12.9 } },
      { minKg: 71, prices: { any: 13.9 } }, { minKg: 45, prices: { any: 13.9 } },
      { minKg: 21, prices: { any: 14.9 } },
    ],
    渥太华: [
      { minKg: 1000, prices: { any: 14.3 } }, { minKg: 100, prices: { any: 14.3 } },
      { minKg: 71, prices: { any: 15.3 } }, { minKg: 45, prices: { any: 15.3 } },
      { minKg: 21, prices: { any: 16.3 } },
    ],
  },
};

/** 澳洲海派：0-10kg 首续重；11kg+ 按档 */
export const AU_SEA_PRICES: Record<string, { firstKg: number; addKg: number; tiers: WeightBreak[] }> = {
  au1: { firstKg: 40, addKg: 16, tiers: [
    { minKg: 1001, prices: { any: 12.5 } }, { minKg: 501, prices: { any: 12.5 } },
    { minKg: 301, prices: { any: 12.5 } }, { minKg: 101, prices: { any: 13 } },
    { minKg: 51, prices: { any: 13.5 } }, { minKg: 11, prices: { any: 14 } },
  ] },
  au2: { firstKg: 40, addKg: 16, tiers: [
    { minKg: 1001, prices: { any: 12.5 } }, { minKg: 501, prices: { any: 12.5 } },
    { minKg: 301, prices: { any: 12.5 } }, { minKg: 101, prices: { any: 13 } },
    { minKg: 51, prices: { any: 13.5 } }, { minKg: 11, prices: { any: 14 } },
  ] },
  au3: { firstKg: 42, addKg: 18, tiers: [
    { minKg: 1001, prices: { any: 14.5 } }, { minKg: 501, prices: { any: 14.5 } },
    { minKg: 301, prices: { any: 15.5 } }, { minKg: 101, prices: { any: 16 } },
    { minKg: 51, prices: { any: 17 } }, { minKg: 11, prices: { any: 17 } },
  ] },
  au4: { firstKg: 42, addKg: 19, tiers: [
    { minKg: 1001, prices: { any: 14 } }, { minKg: 501, prices: { any: 14 } },
    { minKg: 301, prices: { any: 14.5 } }, { minKg: 101, prices: { any: 15 } },
    { minKg: 51, prices: { any: 15.5 } }, { minKg: 11, prices: { any: 15.5 } },
  ] },
  auOther: { firstKg: 52, addKg: 22, tiers: [
    { minKg: 1001, prices: { any: 21 } }, { minKg: 501, prices: { any: 22 } },
    { minKg: 301, prices: { any: 23 } }, { minKg: 101, prices: { any: 24 } },
    { minKg: 51, prices: { any: 25 } }, { minKg: 11, prices: { any: 26 } },
  ] },
};

// ---------------- 货物属性与附加费 ----------------

export interface CargoType {
  id: string;
  label: string;
}

export const CARGO_TYPES: CargoType[] = [
  { id: "general", label: "普货（无电无磁无液体）" },
  { id: "apparel", label: "服装纺织 / 鞋包" },
  { id: "wood", label: "木制品 / 含木包装" },
  { id: "battery", label: "带电（内置电池）" },
  { id: "cosmetic", label: "化妆品" },
  { id: "toys", label: "儿童玩具（12 岁以上）" },
  { id: "highvalue", label: "高货值（相机/手机等）" },
  { id: "adult", label: "成人用品" },
  { id: "solar", label: "太阳能产品" },
  { id: "audio", label: "耳机 / 麦克风 / 音响" },
  { id: "epidemic", label: "防疫物资" },
  { id: "battery_pure", label: "纯电 / 充电宝" },
];

/** 美国海派品类附加费（RMB/KG） */
export const US_SEA_CARGO_SURCHARGE: Record<string, number> = {
  apparel: 1, wood: 1, battery: 1, toys: 2, highvalue: 2, adult: 2, solar: 2, cosmetic: 4,
};

/** 需要人工单询的货物（渠道拒收/冲货高危） */
export const MANUAL_QUOTE_CARGO: Record<string, string> = {
  battery_pure: "纯电/充电宝属人工单询品（普货渠道拒收带电，冲货罚款 2000 元起）",
};

export function findRealChannel(id: string): RealChannelDef | null {
  return REAL_CHANNELS.find((c) => c.id === id) ?? null;
}

export function channelsForCountry(countryCode: string): RealChannelDef[] {
  return REAL_CHANNELS.filter((c) => c.country.includes(countryCode));
}
