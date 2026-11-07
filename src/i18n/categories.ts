// 类目桶名中英对照：DB 里 category 是中文桶名，前台按语言显式映射（不机翻、不编）
// 新桶出现时缺省会回落中文原名——宁可显示中文，不编英文
export const CAT_LABELS: Record<string, { zh: string; en: string }> = {
  美妆个护: { zh: "美妆个护", en: "Beauty & Personal Care" },
  电子数码: { zh: "电子数码", en: "Electronics" },
  服装服饰: { zh: "服装服饰", en: "Apparel & Fashion" },
  家居日用: { zh: "家居日用", en: "Home & Household" },
  户外运动: { zh: "户外运动", en: "Outdoor & Sports" },
  宠物用品: { zh: "宠物用品", en: "Pet Supplies" },
  玩具母婴: { zh: "玩具母婴", en: "Toys & Mother-Baby" },
  包装印刷: { zh: "包装印刷", en: "Packaging & Printing" },
  箱包皮具: { zh: "箱包皮具", en: "Bags & Leather Goods" },
  五金工具: { zh: "五金工具", en: "Hardware & Tools" },
  厨房餐饮: { zh: "厨房餐饮", en: "Kitchen & Dining" },
  工艺礼品: { zh: "工艺礼品", en: "Crafts & Gifts" },
  饰品配件: { zh: "饰品配件", en: "Jewelry & Accessories" },
  鞋靴: { zh: "鞋靴", en: "Footwear" },
  文具办公: { zh: "文具办公", en: "Stationery & Office" },
  灯饰照明: { zh: "灯饰照明", en: "Lighting" },
  汽车用品: { zh: "汽车用品", en: "Automotive" },
  家具: { zh: "家具", en: "Furniture" },
};

export function catLabel(cat: string, lang: string): string {
  const m = CAT_LABELS[cat];
  if (!m) return cat;
  return lang === "en" ? m.en : m.zh;
}
