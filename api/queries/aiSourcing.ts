import { generateObject, generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { listModels } from "../lib/ai-client";
import { matchFactories } from "./factories";
import { extractOfferId, offerWithFactory } from "./products";
import { searchOffers } from "../sourcing/offerService";
import { expandQuery, LEXICON } from "../../contracts/lexicon";
import { log } from "../lib/logger";
import { listRadar } from "./radar";

// ============ 选品意图：买家问"什么好卖/爆款/趋势" → 直接给真实雷达榜，不走 LLM ============
const SELECTION_RE = /(好卖|爆款|热卖|畅销|趋势|选品|卖什么|什么.*(卖|火)|海外.*(流行|热)|trending|best[\s-]*seller|hot[\s-]*sell)/i;

async function radarSelectionReply() {
  try {
    const { items } = await listRadar();
    if (!items.length) return null;
    const top = items.slice(0, 5);
    const lines = top.map((it, i) => {
      const price = it.factoryPriceMin != null && it.factoryPriceMax != null ? `出厂价带 ¥${it.factoryPriceMin}–${it.factoryPriceMax}` : "出厂价询我查实价";
      const retail = it.retailPriceUsd != null ? `，海外零售约 $${it.retailPriceUsd}` : "";
      return `${i + 1}. ${it.title}${it.titleEn ? `（${it.titleEn}）` : ""}\n   ${it.signalText}${retail}\n   ${price}，严选库相关工厂 ${it.vettedCount ?? 0} 家`;
    });
    const reply = `问对人了——这周海外在涨的品，我挑了 ${items.length} 个工厂能造的放在「海外爆款雷达」里，每一条都有真实榜单出处。先说前 5 个：\n\n${lines.join("\n\n")}\n\n完整榜单在「海外爆款雷达」页，每个品我都写了句实在话（该避的坑也写了）。看中哪个直接告诉我，我帮你查对口工厂、算到目的国的到手价。提醒一句：榜单是需求信号不是保票，先小单试水再放大。`;
    return {
      reply,
      understood: true,
      intent: { product: null, quantity: null },
      factories: [],
      products: [],
      product: null,
    };
  } catch (e) {
    log.warn("雷达榜查询失败，按普通对话流程走", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}


const kimiGw = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL!,
  apiKey: process.env.KIMI_AGENTGW_API_KEY!,
  supportsStructuredOutputs: true,
});

// ============ 阶段一：意图抽取（只抽事实，不写给用户的话）============
// 关键设计：reply 绝不在这个阶段生成——此时还不知道匹配结果，让模型写话术必然说空话。
const INTENT_SYSTEM = `你是采购需求解析器。从用户消息和对话历史中抽取采购意图，输出 JSON，不要寒暄、不要写给用户看的话。

规则：
1. product = 标准化品类词（中文，尽量具体到产品，如"瑜伽裤""宠物降温垫"；用户说英文品类词要翻成中文）。历史里已明确的品类要继承。
2. quantity = 数量（number 或 null），destination = 发往国家/地区（或 null）。
3. budgetNote = 用户提到的目标价/预算，原样摘录（或 null）。
4. followUp = 还差关键信息时，一个最关键的追问（优先级：品类 → 数量 → 目标价/预算）。信息够则 null。
5. 用户只是打招呼/闲聊/说"继续"但没有新品类时：isGreeting=true。`;

const intentSchema = z.object({
  product: z.string().nullable(),
  quantity: z.number().nullable(),
  destination: z.string().nullable(),
  budgetNote: z.string().nullable(),
  followUp: z.string().nullable(),
  isGreeting: z.boolean(),
});

// ============ 阶段三：基于真实匹配结果生成话术 ============
// 模型只能看到系统实际筛出来的工厂，说几家就是几家，物理上无法说空话。
const REPLY_SYSTEM = `你是 SourcBuy 的 AI 采购代理，人格是"替买家把关的老采购"——专业、直接、诚实，像做了二十年的中国供应链采购经理。

你会收到：用户消息、对话历史、抽取的采购意图、以及系统真实筛出的工厂清单（JSON，可能为空数组）。

规则：
1. 工厂卡片会由界面展示在你的话下面（含评分、分层、类目排名、推荐证据），你不要逐家罗列工厂名，只做点评、给建议、提示风险（一两句点到即可）。引用工厂的真实数据点评（评分、年限、复购率、回复率等），但不要在话术里报类目池子总数（如"484 家严选厂里的前 6 名"这种表达禁止）——排名交给卡片展示，你只说"类目头部""该类目前列"这类定性判断。
2. 清单为空时必须诚实说明"这个品类词库里暂时没匹配到合适的工厂"，并给 1-2 个替代建议（换个更通用的品类词 / 放宽条件 / 留需求给人工买手）。绝不允许声称"已筛出/下面是对比"等没有发生的事。
3. 需求不靠谱要直说：预算明显低于成本要劝，起订量太小别推源头大厂。不当应声虫。
4. 还差关键信息（数量/目标价）时，在话尾补一个追问，一次只问一个。
5. 回复简短口语化，不说教，不堆术语。买家是海外小 B 卖家。
6. 纯文本输出：不要用任何 Markdown 语法（不用 ** 加粗、不用 # 标题、不用 - 列表符），换行分段即可。
7. 不要暴露内部术语（如 relaxedThreshold）；如果系统放宽了评分门槛，用"我把评分门槛放宽了些"这样的口语表达。
8. 如果系统事实里有 linkedProduct：这是用户贴的商品链接的真实数据。要点评这个货——阶梯价什么水平、起订量合不合理；factoryInOurDb 非空时说明"这家厂就在我们严选库里"并给出评级，为空时提醒"这家店不在我们严选库，下单前建议验厂"。若 linkedProduct.fetchFailed=true，说明商品没拉到，让用户检查链接或货号。
9. 不要在回复中提及任何货源平台名称（如 1688），统一说"货源平台"或"你贴的商品链接"。我们是采购代理，不给上游平台引流。
10. 平台铁律：只代表买家，不收工厂返点；推荐按评分中立排序，评分算法公开（七维加权），工厂不可付费影响排名。
11. 如果系统事实里有 searchProducts（真实搜到的在售商品，含价格/销量）：这些商品会以卡片形式展示在你的话下面。买家先看到货再谈厂——话术里可以点评整体价格带和销量表现（如"主流款出厂价在 ¥xx–xx，有款月销过万的"），不要逐个念标题。
12. 如果 factoryCount=0 但 searchProducts 非空：诚实说"严选库里暂时还没有验过专做这个品的厂，我不拿不相干的厂糊弄你"，然后引导买家从商品卡里挑中意的款发我，我去查它背后的供应商底细（严选库比对，必要时安排验厂）。绝不允许把其他类目的工厂说成做这个品的——之前把做帐篷的厂推给要自行车的买家，这种事故不能再发生。`;

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// greeting 话术 LLM 失败时的静态开场白（与前端首条消息一致）
const GREETING_FALLBACK =
  "你好，我是你的 AI 采购买手，干这行十几年了。你要什么货、多少量、发往哪里，告诉我就行——我帮你找源头好货和好价，背后的工厂我都验过底。每一单为什么推荐、到手价多少，摆证据说清楚；需求不靠谱我也会直说。";

// 常见目的地词表（国名/热门城市），供 LLM 挂掉时的本地意图兜底提取
const DEST_WORDS = [
  "美国", "加拿大", "英国", "德国", "法国", "意大利", "西班牙", "荷兰", "比利时", "波兰", "捷克", "奥地利", "瑞典", "挪威", "丹麦", "芬兰", "爱尔兰", "葡萄牙", "希腊", "瑞士",
  "澳大利亚", "新西兰", "日本", "韩国", "新加坡", "马来西亚", "泰国", "越南", "菲律宾", "印尼", "印度", "阿联酋", "沙特", "迪拜", "土耳其", "以色列",
  "墨西哥", "巴西", "智利", "阿根廷", "哥伦比亚", "秘鲁", "南非", "埃及", "尼日利亚", "肯尼亚", "俄罗斯", "乌克兰",
  "洛杉矶", "纽约", "伦敦", "巴黎", "柏林", "汉堡", "马德里", "米兰", "阿姆斯特丹", "悉尼", "墨尔本", "多伦多", "温哥华", "东京", "大阪", "首尔",
];

// LLM 全挂时的本地意图兜底：词库最长产品词 + 数量正则（排除金额）+ 目的地词表，保证无 LLM 时筛厂/搜货链路照跑
function localIntentFallback(message: string): z.infer<typeof intentSchema> {
  // 纯问候/寒暄本地判定：不查库，交给 greeting 静态开场白（否则"你好"会被当品类去搜货）
  if (/^(你好|您好|hi|hello|hey|嗨|喂|在吗|在不在|早上好|下午好|晚上好|good\s*(morning|afternoon|evening))\s*[!！~～。.。]*$/i.test(message.trim())) {
    return { product: null, quantity: null, destination: null, budgetNote: null, followUp: null, isGreeting: true };
  }
  // 具体产品词优先（跨类目取最长命中），其次类目名，最后短消息原文
  let product: string | null = null;
  let catHit: string | null = null;
  for (const [cat, def] of Object.entries(LEXICON)) {
    for (const p of def.products) {
      if (p.length >= 2 && message.includes(p) && (product == null || p.length > product.length)) product = p;
    }
    if (!catHit && message.includes(cat)) catHit = cat;
  }
  product ??= catHit ?? (message.trim().length <= 20 ? message.trim() : null);
  const text = message.replace(/[,，]/g, "");
  let quantity: number | null = null;
  for (const m of text.matchAll(/(\d{2,7})\s*(?:条|个|件|台|卷|双|只|箱|套|pcs?)?/gi)) {
    const tail = text.slice((m.index ?? 0) + m[0].length);
    if (/^\s*(?:元|块|¥|\$|美元|人民币)/.test(tail)) continue; // 金额不当数量
    quantity = Number(m[1]);
    break;
  }
  const destination = DEST_WORDS.find((w) => message.includes(w)) ?? null;
  return { product, quantity, destination, budgetNote: null, followUp: null, isGreeting: false };
}

// 话术生成超时/失败时的规则兜底——只用系统已拿到的真实数据，一句都不编
function buildFallbackReply(
  intent: { product: string | null; quantity: number | null; destination: string | null },
  factories: { name: string; tier: string | null; score: number | null }[],
  searchProducts: { price: number; promotionPrice: number | null; sales: number }[],
  relaxed: boolean,
): string {
  const parts: string[] = [];
  const what = intent.product ? `「${intent.product}」` : "这个品";
  if (factories.length > 0) {
    parts.push(
      `${what}我筛出 ${factories.length} 家严选厂，卡片在下面——评分、年限、证据都摊开着，你自己核对。${relaxed ? "这回我把评分门槛放宽了些，别嫌厂多。" : ""}`,
    );
  } else {
    parts.push(`${what}，严选库里暂时没验过专做这个的厂，我不拿不相干的厂糊弄你。`);
  }
  if (searchProducts.length > 0) {
    const prices = searchProducts.map((p) => p.promotionPrice ?? p.price).filter((n) => n > 0);
    const band = prices.length ? `主流出厂价带在 ¥${Math.min(...prices)} 到 ¥${Math.max(...prices)}` : "";
    parts.push(`在售货源给你列在下面了，${band ? band + "，" : ""}看中哪款点进去，规格、阶梯价、到手价都能算。`);
  }
  if (!intent.quantity) parts.push("你打算拿多少量？量不同，我谈的价和选的厂都不一样。");
  else if (!intent.destination) parts.push("发往哪个国家？目的地定了，到手价我给你算到个位数。");
  parts.push("（刚才话术生成有点慢，我先把真数据给你，细节咱接着聊。）");
  return parts.join("\n\n");
}

async function sourcingChatInner(message: string, history: ChatMsg[]) {
  // 选品意图（"什么好卖/爆款/趋势"）走真实雷达榜，零 LLM 延迟，绝不编数据
  if (SELECTION_RE.test(message) && !extractOfferId(message)) {
    const radar = await radarSelectionReply();
    if (radar) return radar;
  }
  // 模型清单与意图抽取并行——省 2-4s 冷启动
  const [modelsRes, intentRes] = await Promise.allSettled([
    listModels(),
    generateObject({
      model: kimiGw(process.env.KIMI_AGENTGW_MODEL ?? "kimi-k2-thinking"),
      system: INTENT_SYSTEM,
      messages: [
        ...history.slice(-10).map((m) => ({ role: m.role, content: m.content }) as const),
        { role: "user" as const, content: message },
      ],
      schema: intentSchema,
      abortSignal: AbortSignal.timeout(12_000), // 意图抽取 12s 封顶（预览网关超时紧，给后端全链留余量）
    }),
  ]);
  const defaultModelId = modelsRes.status === "fulfilled" ? modelsRes.value.defaultModelId : process.env.KIMI_AGENTGW_MODEL ?? "kimi-k2-thinking";
  // 意图抽取失败绝不抛 500：降级到本地词库兜底，筛厂/搜货链路照跑
  if (intentRes.status === "rejected") {
    log.warn("意图抽取失败，走本地词库兜底", { error: intentRes.reason instanceof Error ? intentRes.reason.message : String(intentRes.reason) });
  }
  const intent = intentRes.status === "fulfilled" ? intentRes.value.object : localIntentFallback(message);
  const messages = [
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content }) as const),
    { role: "user" as const, content: message },
  ];

  // 阶段一·五：用户贴了 1688 链接/货号 → 实时拉取真实商品 + 背后工厂
  const offerId = extractOfferId(message);
  let productInfo: Awaited<ReturnType<typeof offerWithFactory>> | null = null;
  let productFetchFailed = false;
  if (offerId) {
    try {
      const r = await offerWithFactory(offerId);
      if (r.offer) productInfo = r;
      else productFetchFailed = true;
    } catch {
      productFetchFailed = true; // 聚合 API 失败时降级：话术里说明，不阻塞对话
    }
  }

  // 纯闲聊（且没带链接）：直接回，不查库；LLM 失败时给静态开场白，不报错
  if (intent.isGreeting && !intent.product && !productInfo) {
    try {
      const { text } = await generateText({
        model: kimiGw(defaultModelId),
        system: REPLY_SYSTEM,
        prompt: `用户消息：${message}\n采购意图：纯闲聊/无明确品类\n工厂清单：[]`,
        abortSignal: AbortSignal.timeout(12_000),
      });
      return { reply: text, understood: false, intent, factories: [], product: null };
    } catch (e) {
      log.warn("greeting 话术生成失败，用静态开场白", { error: e instanceof Error ? e.message : String(e) });
      return { reply: GREETING_FALLBACK, understood: false, intent, factories: [], product: null };
    }
  }

  // 阶段二：真实匹配（先按 85 分门槛，不足 3 家放宽门槛补齐）
  // 品类词来源：意图抽取优先；用户贴了商品链接时，从真实商品标题/类目兜底
  let keyword = intent.product;
  if (!keyword && productInfo?.offer) {
    const titleHit = expandQuery(productInfo.offer.title);
    if (titleHit.category) keyword = productInfo.offer.title;
  }
  let factories: Awaited<ReturnType<typeof matchFactories>> = [];
  let relaxed = false;
  let searchProducts: { offerId: string; title: string; image: string | null; price: number; promotionPrice: number | null; sales: number }[] = [];
  if (keyword) {
    // 工厂匹配与商品搜索并行——两个独立数据源，串行白等 3-5s
    const [fRes, sRes] = await Promise.allSettled([
      (async () => {
        let fs = await matchFactories({ keyword, limit: 6 });
        let wasRelaxed = false;
        if (fs.length < 3) {
          const more = await matchFactories({ keyword, minScore: 0, limit: 6 });
          if (more.length > fs.length) {
            fs = more;
            wasRelaxed = true;
          }
        }
        return { fs, wasRelaxed };
      })(),
      productInfo
        ? Promise.resolve(null)
        : searchOffers(keyword, 1).catch(() => null), // 搜索源失败不阻塞对话
    ]);
    if (fRes.status === "fulfilled") {
      factories = fRes.value.fs;
      relaxed = fRes.value.wasRelaxed;
    } else {
      log.warn("工厂匹配失败，本轮不带厂卡", { error: fRes.reason instanceof Error ? fRes.reason.message : String(fRes.reason) });
    }
    if (sRes.status === "fulfilled" && sRes.value) {
      searchProducts = sRes.value.items.slice(0, 8);
    }
  }

  // 阶段三：基于真实结果写话术
  const prices = searchProducts.map((p) => p.promotionPrice ?? p.price).filter((n) => n > 0);
  const facts = JSON.stringify({
    intent,
    factoryCount: factories.length,
    relaxedThreshold: relaxed,
    searchProducts: searchProducts.length
      ? {
          count: searchProducts.length,
          priceBand: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
          top: searchProducts.slice(0, 5).map((p) => ({ price: p.promotionPrice ?? p.price, sales: p.sales })),
        }
      : null,
    linkedProduct: productInfo
      ? {
          offerId: productInfo.offer!.offerId,
          title: productInfo.offer!.title,
          categoryName: productInfo.offer!.categoryName,
          priceTiers: productInfo.offer!.priceTiers,
          unit: productInfo.offer!.unit,
          shopName: productInfo.offer!.shopName,
          factoryInOurDb: productInfo.factory
            ? {
                name: productInfo.factory.name,
                tier: productInfo.factory.tier,
                score: productInfo.factory.score,
              }
            : null,
        }
      : productFetchFailed
        ? { fetchFailed: true }
        : null,
    factories: factories.map((f) => ({
      name: f.name,
      tier: f.tier,
      score: f.score,
      years: f.years,
      location: f.location,
      reason: f.reason,
      categoryRank: f.categoryRank,
      evidence: f.evidence,
    })),
  });
  // 阶段三：基于真实结果写话术（18s 封顶；超时/失败 → 规则模板兜底，绝不让买家白等报错）
  let reply: string;
  try {
    const r = await generateText({
      model: kimiGw(defaultModelId),
      system: REPLY_SYSTEM,
      messages: [
        ...messages,
        { role: "user" as const, content: `[系统事实] ${facts}\n请基于以上事实回复用户。` },
      ],
      abortSignal: AbortSignal.timeout(18_000),
    });
    reply = r.text;
  } catch (e) {
    log.warn("reply 话术生成失败，走规则模板兜底", { error: e instanceof Error ? e.message : String(e) });
    reply = buildFallbackReply(intent, factories, searchProducts, relaxed);
  }

  return {
    reply,
    understood: factories.length > 0 || !!productInfo || searchProducts.length > 0,
    intent: { product: intent.product, quantity: intent.quantity },
    factories,
    products: searchProducts,
    product: productInfo
      ? { offer: productInfo.offer, factory: productInfo.factory }
      : null,
  };
}

// 最外层保险：任何漏网异常都不让买家看到报错——返回诚实的降级话术（HTTP 200），并留日志可查
export async function sourcingChat(message: string, history: ChatMsg[]) {
  try {
    return await sourcingChatInner(message, history);
  } catch (e) {
    log.error("ai.chat 未捕获异常，走全兜底", { error: e instanceof Error ? e.message : String(e) });
    return {
      reply:
        "我这边系统卡了一下——不是你的问题，是我这头的接口闹脾气。你的话我记住了，稍等片刻再发一次就行；急着看货就先去「严选工厂库」自己逛，看中的发我，我接着帮你查底细。",
      understood: false,
      intent: { product: null, quantity: null },
      factories: [],
      products: [],
      product: null,
    };
  }
}
