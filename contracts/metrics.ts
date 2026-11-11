// M5 经营口径单一事实源——全站数字只从这里出，改口径只改这里。
//
// GMV 口径（2026-11-11 罗总拍板）：按「接受报价」算——订单从 quoted 进入
// pending_payment 那一刻记 GMV（快照 quote.totalUsd，事后改价不回溯）。
// 未来要改"已付款实收"口径：把 GMV_MODE 改成 "on_paid"，再跑 db/m5-schema.ts
// 的回填逻辑改判定点即可，历史数据按新口径重算，不用返工。
export const GMV_MODE = "on_accept" as const; // "on_accept" | "on_paid"
export const GMV_LABEL = "接受报价口径（含货值+佣金+运费，快照冻结）";

// 渠道归一化：utm_source / referrer 域名 → 展示渠道名。宁可归「直接访问」也不瞎猜。
const REFERRER_MAP: [RegExp, string][] = [
  [/tiktok/i, "TikTok"],
  [/facebook|fb\.com|instagram/i, "Facebook / Instagram"],
  [/google\./i, "Google"],
  [/youtube/i, "YouTube"],
  [/bing\./i, "Bing"],
  [/x\.com|twitter/i, "X (Twitter)"],
  [/linkedin/i, "LinkedIn"],
  [/whatsapp/i, "WhatsApp"],
  [/pinterest/i, "Pinterest"],
  [/reddit/i, "Reddit"],
  [/sourcbuy(ai)?\.com/i, "站内跳转"],
];

export function normalizeChannel(utmSource?: string | null, referrer?: string | null): string {
  const src = (utmSource ?? "").trim();
  if (src) {
    for (const [re, name] of REFERRER_MAP) if (re.test(src)) return name;
    return src.slice(0, 64); // 未识别的 UTM 原样展示（投放方自定义渠道名）
  }
  const ref = (referrer ?? "").trim();
  if (!ref) return "直接访问";
  for (const [re, name] of REFERRER_MAP) if (re.test(ref)) return name;
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    return host || "直接访问";
  } catch {
    return "直接访问";
  }
}
