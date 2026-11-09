// 字段级来源标注（借鉴对方系统 requirement.py 的诚实度设计，落地为我方确定性验证版）
// 核心原则：不信 LLM 自报来源——字段值能否在买家原话/历史里找到证据，由后端规则判定。
// 四态：user=买家明确说过（在语料里找到原文证据）｜ai=AI 推断（必须带置信度与纠正提示）｜
//        derived=由其他真实字段推导｜unknown=缺失（绝不猜）。
// 铁律对齐：「不编数据，任何默认值假设必须显式可见」——AI 推断的字段必须在界面上亮明身份。

export type FieldSource = "user" | "ai" | "derived" | "unknown";

export interface SourceNote {
  source: FieldSource;
  confidence: number | null; // ai 态必填（0-1）；user/unknown 为 null
  note: { zh: string; en: string }; // 双语解释判断依据，界面 hover/tap 可见
}

export interface IntentLike {
  product: string | null;
  quantity: number | null;
  destination: string | null;
  budgetNote: string | null;
  region: string | null;
  isGreeting: boolean;
}

export type IntentSources = Record<"product" | "quantity" | "destination" | "budget" | "region", SourceNote>;

const NOTE = {
  userSaid: { zh: "你原话里说的", en: "From your message" },
  aiInfer: { zh: "AI 按你的描述推断——认错请纠正", en: "AI inferred from your description — correct me if wrong" },
  aiImage: { zh: "AI 从你发的图片里认的——认错请纠正", en: "AI recognized from your photo — correct me if wrong" },
  aiHistory: { zh: "AI 从对话上下文接续推断——认错请纠正", en: "AI carried over from our conversation — correct me if wrong" },
  radarPick: { zh: "你从爆款雷达榜单点的品类", en: "Category from the radar card you tapped" },
  missing: { zh: "你还没说，我不猜", en: "Not stated — I won't guess" },
} as const;

// 英文目的地 → 中文标准词 的原文证据映射（买家说 "ship to US"，intent.destination="美国" 时仍可判 user）
const DEST_EN_EVIDENCE: Record<string, RegExp> = {
  美国: /\b(u\.?s\.?a?|america|united states|states)\b/i,
  英国: /\b(uk|u\.k\.|britain|england|united kingdom)\b/i,
  德国: /\b(germany|german)\b/i,
  法国: /\b(france|french)\b/i,
  日本: /\b(japan|japanese)\b/i,
  韩国: /\b(korea|south korea)\b/i,
  加拿大: /\b(canada|canadian)\b/i,
  澳大利亚: /\b(australia|aussie)\b/i,
  新西兰: /\bnew zealand\b/i,
  意大利: /\b(italy|italian)\b/i,
  西班牙: /\b(spain|spanish)\b/i,
  荷兰: /\b(netherlands|holland|dutch)\b/i,
  墨西哥: /\b(mexico|mexican)\b/i,
  巴西: /\b(brazil|brazilian)\b/i,
  阿联酋: /\b(uae|u\.a\.e\.|emirates)\b/i,
  迪拜: /\bdubai\b/i,
  沙特: /\b(saudi|ksa)\b/i,
  新加坡: /\bsingapore\b/i,
  马来西亚: /\bmalaysia\b/i,
  泰国: /\bthailand\b/i,
  越南: /\bvietnam\b/i,
  印度: /\bindia\b/i,
  印尼: /\bindonesia\b/i,
};

function unknownNote(): SourceNote {
  return { source: "unknown", confidence: null, note: NOTE.missing };
}

function aiNote(confidence: number, note: (typeof NOTE)[keyof typeof NOTE]): SourceNote {
  return { source: "ai", confidence, note };
}

function userNote(note: (typeof NOTE)[keyof typeof NOTE] = NOTE.userSaid): SourceNote {
  return { source: "user", confidence: null, note };
}

/**
 * 给 intent 逐字段打来源标。
 * @param message 买家本条原话（可含链接，函数内自行剥离）
 * @param historyUserText 历史里所有买家消息拼接（继承字段的证据来源）
 * @param intent 已确定的意图（LLM 或本地兜底产物）
 * @param opts.fromImage 本条带商品图（product 可能是图里认的）
 * @param opts.fromRadar 雷达榜单直达（品类来自买家点击行为=user）
 */
export function tagIntentSources(
  message: string,
  historyUserText: string,
  intent: IntentLike,
  opts: { fromImage?: boolean; fromRadar?: boolean } = {}
): IntentSources {
  // 证据语料=本条原话（剥离 URL——链接标题里的词不算买家自己说的）+历史买家消息
  const cleanMsg = message.replace(/https?:\/\/\S+/g, " ").replace(/^\[(?:补充|跳过补充)\]\s*/, "");
  const corpus = `${cleanMsg} ${historyUserText}`;

  // --- product ---
  let product: SourceNote;
  if (!intent.product) {
    product = unknownNote();
  } else if (opts.fromRadar) {
    product = userNote(NOTE.radarPick); // 买家亲手点的榜单品类，视同买家指定
  } else if (corpus.includes(intent.product)) {
    product = userNote();
  } else if (opts.fromImage) {
    product = aiNote(0.5, NOTE.aiImage);
  } else {
    // 原话与历史里都找不到这个词——LLM 归纳/翻译/继承失败都有可能，标 AI 推断
    product = aiNote(0.35, NOTE.aiInfer);
  }

  // --- quantity：与本地兜底同一套口径（数字+量词，排除金额尾巴）在语料里找得到原值才算 user ---
  let quantity: SourceNote;
  if (intent.quantity == null) {
    quantity = unknownNote();
  } else {
    const text = corpus.replace(/[,，]/g, "");
    let found = false;
    for (const m of text.matchAll(/(\d{2,7})\s*(?:条|个|件|台|卷|双|只|箱|套|pcs?)?/gi)) {
      const tail = text.slice((m.index ?? 0) + m[0].length);
      if (/^\s*(?:元|块|¥|\$|美元|人民币)/.test(tail)) continue; // 金额不当数量
      if (Number(m[1]) === intent.quantity) { found = true; break; }
    }
    quantity = found ? userNote() : aiNote(0.3, NOTE.aiHistory);
  }

  // --- destination ---
  let destination: SourceNote;
  if (!intent.destination) {
    destination = unknownNote();
  } else {
    const zh = corpus.includes(intent.destination);
    const en = DEST_EN_EVIDENCE[intent.destination]?.test(corpus) ?? false;
    destination = zh || en ? userNote() : aiNote(0.35, NOTE.aiInfer);
  }

  // --- budget：prompt 规则要求"原样摘录"，数字部分在语料里找得到即 user ---
  let budget: SourceNote;
  if (!intent.budgetNote) {
    budget = unknownNote();
  } else {
    const nums = intent.budgetNote.match(/\d+(?:\.\d+)?/g) ?? [];
    const found = nums.length > 0 && nums.every((n) => corpus.includes(n));
    budget = found ? userNote() : aiNote(0.35, NOTE.aiInfer);
  }

  // --- region ---
  let region: SourceNote;
  if (!intent.region) {
    region = unknownNote();
  } else {
    region = corpus.includes(intent.region) ? userNote() : aiNote(0.35, NOTE.aiInfer);
  }

  return { product, quantity, destination, budget, region };
}
