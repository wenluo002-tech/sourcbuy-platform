/**
 * 消息分流预判（V106 图1，罗总 2026-11-19 拍板）：纯词库+信号词正则，零 LLM，十毫秒级。
 * 用途=前端决定 pending 期间播「四步作业卡」还是极简「正在看…」——寒暄/报称呼不再表演寻源流程。
 * 口径宁宽勿窄：误判为 sourcing 只是多播动画（现状），误判为 light 则买家问货少了过程感。
 * 注意与 LLM 意图抽取无涉——只驱动 loading UI，答案内容不受影响。
 */
import { expandQuery } from "../../contracts/lexicon";

// 采购信号词：没带产品词但明显在谈生意（中英，小写比对）
const SIGNAL_WORDS = [
  "价", "报价", "多少钱", "运费", "样品", "起订", "工厂", "货源", "采购", "批发",
  "定制", "贴牌", "代工", "拿货", "验厂", "货期", "交期", "发票",
  "price", "quote", "sample", "moq", "factory", "shipping", "wholesale", "oem", "odm",
];

export function classifyLite(msg: string): "sourcing" | "light" {
  const text = msg.trim();
  if (!text) return "light";
  // 1) 词库产品词/类目命中 → 真寻源
  if (expandQuery(text).category) return "sourcing";
  // 2) 带数字 ≈ 带量/预算/货号（采购对话高频特征）
  if (/\d/.test(text)) return "sourcing";
  // 3) 采购信号词
  const lower = text.toLowerCase();
  if (SIGNAL_WORDS.some((w) => lower.includes(w))) return "sourcing";
  // 4) 长消息大概率是需求描述，短消息才可能是寒暄
  if (text.length > 25) return "sourcing";
  return "light";
}
