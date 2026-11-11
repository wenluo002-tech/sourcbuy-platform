// 数据层中文单位 → 买家语言单位词映射（件/双/套/箱…是封闭集合，不走 LLM：零延迟零成本）。
// 查不到映射的单位原样返回（如实显示，不瞎编）。

type TFn = (path: string, vars?: Record<string, string | number>) => any;

const UNIT_KEY: Record<string, string> = {
  件: "pcs", 个: "pcs", 只: "pcs", 片: "pcs", 条: "pcs", 把: "pcs", 支: "pcs", 颗: "pcs", 块: "pcs", 张: "pcs",
  双: "pairs", 副: "pairs", 对: "pairs",
  套: "sets",
  箱: "boxes", 盒: "boxes",
  台: "units",
  卷: "rolls",
  瓶: "bottles",
  包: "packs",
  袋: "bags",
  打: "dozen",
};

/** 商品单位按界面语言显示：中文界面原样，外语界面走映射表，查不到回原文 */
export function unitLabel(unit: string | null | undefined, lang: string, t: TFn): string {
  if (!unit) return t("chat.unitPc");
  if (lang === "zh") return unit;
  const k = UNIT_KEY[unit.trim()];
  return k ? t(`chat.u_${k}`) : unit;
}
