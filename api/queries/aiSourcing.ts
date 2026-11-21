import { generateObject, generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { listModels } from "../lib/ai-client";
import { matchFactories } from "./factories";
import { recordGap } from "./gapRadar";
import { extractOfferId, offerWithFactory } from "./products";
import { searchOffers, linkTopOffersToFactories, poolSearch, legacyLinkedFactories } from "../sourcing/offerService";
import { expandQuery, LEXICON } from "../../contracts/lexicon";
import { looksLikeAccessory, mentionIsAccessoryCompound, queryWantsAccessory } from "../../contracts/productForm";
import { sanitizeSalutation } from "../../contracts/salutation";
import { getUserSalutation, updateUserSalutation } from "./auth";
import { log } from "../lib/logger";
import { listRadar, getRadarItem } from "./radar";
import { extractExternalUrl, resolveExternalLink, type LinkContext } from "./linkResolve";
import { maskFactory, maskOffer, maskedFactoryName } from "../lib/mask";
import { proxyImageUrl } from "../lib/imgProxy";
import { enrichFactoryLive } from "./shopEnrich";
import { getDb } from "./connection";
import { sql as dsql } from "drizzle-orm";
import { getBuyerProfile } from "./context";
import { tagIntentSources } from "../../contracts/sourceNote";

// 买家在打听某家具体工厂底细（人数/规模/成立年份/验厂/靠不靠谱）的识别词
const FACTORY_QA_RE = /(多少人|员工|工人|规模|面积|厂房|成立|哪年|哪一年|验厂|实力|靠不靠谱|靠谱吗|怎么样|底细|可信|真实|employees|workers|staff|how big|factory size|established|founded|audit|audited|reliable|trust|legit)/i;

// 工厂分层是枚举值，不走 LLM 翻译：喂外语话术前直接映射（与前端 i18n tierName 同口径）——
// 否则 LLM 会把中文「优选/金标」原样引用进外语回复（v80 巡检实抓的中文残留根因之一）
const TIER_I18N: Record<string, Record<string, string>> = {
  金标: { en: "Gold", es: "Oro", fr: "Or", pt: "Selo ouro", ka: "ოქროს" },
  银标: { en: "Silver", es: "Plata", fr: "Argent", pt: "Selo prata", ka: "ვერცხლის" },
  铜标: { en: "Bronze", es: "Bronce", fr: "Bronze", pt: "Selo bronze", ka: "ბრინჯაოს" },
  优选: { en: "Rising", es: "Selección preferente", fr: "Sélection", pt: "Preferida", ka: "რჩეული" },
  培育: { en: "New", es: "En desarrollo", fr: "En développement", pt: "Em desenvolvimento", ka: "ახალი" },
};
const tierLabel = (tier: string | null | undefined, locale: string): string | null =>
  tier ? (locale === "zh" ? tier : (TIER_I18N[tier]?.[locale] ?? tier)) : null;

// ============ 选品意图：买家问"什么好卖/爆款/趋势" → 直接给真实雷达榜，不走 LLM ============
const SELECTION_RE = /(好卖|爆款|热卖|畅销|趋势|选品|卖什么|什么.*(卖|火)|海外.*(流行|热)|trending|best[\s-]*seller|hot[\s-]*sell)/i;

async function radarSelectionReply(locale: string = "zh") {
  try {
    const { items } = await listRadar();
    if (!items.length) return null;
    const top = items.slice(0, 5);
    if (locale !== "zh") {
      // 外语版：标题用 titleEn，信号文本走翻译管线（终身缓存；失败回落原文）
      const { translateTexts } = await import("../lib/translate");
      const sigMap = await translateTexts(top.map((it) => it.signalText), locale);
      const lines = top.map((it, i) => {
        const price = it.factoryPriceMin != null && it.factoryPriceMax != null ? `EXW range ¥${it.factoryPriceMin}–${it.factoryPriceMax}` : "ask me for a live factory quote";
        const retail = it.retailPriceUsd != null ? ` · overseas retail ≈ $${it.retailPriceUsd}` : "";
        return `${i + 1}. ${it.titleEn ?? it.title}\n   ${sigMap[it.signalText] ?? it.signalText}${retail}\n   ${price} · ~${it.vettedCount ?? 0} vetted factories in our database`;
      });
      const reply = `Good timing — here are the ${items.length} items climbing overseas this week that our factories can actually make, each with a verifiable source on the Best-Seller Radar board. Top 5:\n\n${lines.join("\n\n")}\n\nThe full board is on the Radar page — I wrote an honest note for every item, including the traps to avoid. Tell me which one catches your eye and I'll check the right factories and price it landed to your door. One reminder: the board shows demand signals, not guarantees — test small first, then scale.`;
      return { reply, understood: true, intent: { product: null, quantity: null }, factories: [], products: [], product: null, followUp: null };
    }
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
      followUp: null,
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
4.5 region = 买家指定的产地/城市（如"中山的灯饰厂"→"中山"，"义乌小商品"→"义乌"）。买家没指定产地时=null。注意与 destination（发往国）区分：region 是"货从哪产"，destination 是"货运到哪"。
5. 用户只是打招呼/闲聊/说"继续"但没有新品类时：isGreeting=true。
6. salutation = 用户在这条消息里告知的"希望被如何称呼"（如"叫我王哥"→"王哥"、"I'm Kevin"→"Kevin"、"张总就行"→"张总"）。只有用户明确在回答/告知称呼时才抽取，其余一律 null——绝不从消息里猜名字，绝不把产品词当人名。只从最后这条用户消息里抽；历史消息里已经出现过的称呼不要重复抽取。`;

const intentSchema = z.object({
  product: z.string().nullable(),
  quantity: z.number().nullable(),
  destination: z.string().nullable(),
  budgetNote: z.string().nullable(),
  followUp: z.string().nullable(),
  region: z.string().nullable(), // 买家指定的产地/城市（如"中山""义乌"），没指定=null
  isGreeting: z.boolean(),
  salutation: z.string().nullable(), // V105 称谓：用户明确告知/回答"怎么称呼您"时抽取（"叫我王哥"→"王哥"），否则 null
});

// 带商品图时的扩展意图：单次 LLM 调用同时出品类词与图上可见规格（省一次往返）
const imageIntentSchema = intentSchema.extend({
  specsNote: z.string().nullable(),
});

// ============ 阶段三：基于真实匹配结果生成话术 ============
// 模型只能看到系统实际筛出来的工厂，说几家就是几家，物理上无法说空话。
const REPLY_SYSTEM = `你是 SourcBuy 的 AI 采购代理，人格是"替买家把关的老采购"——专业、直接、诚实，像做了二十年的中国供应链采购经理。

你会收到：用户消息、对话历史、抽取的采购意图、以及系统真实筛出的工厂清单（JSON，可能为空数组）。

规则：
1. 叙事结构（产品为锚，三段式，CO-001 口径）：先讲货——这批货的价格带/销量/现货水平怎么样；再一句工厂背书——只用档位定性（金标/银标档）+年限+在售证据（如"主推这家是金标档、12 年老厂、这款正在售"），绝不抛评分数字、绝不逐家罗列厂名；最后一句兜底——下单走平台，双检+先行赔付，货不对板不用买家自己找工厂扯皮（一句即可，不展开承诺细节）。工厂卡片由界面展示在你的话下面（分层、排名、证据都在卡上），你只做点评、给建议、提示风险（一两句点到即可）。不要在话术里报类目池子总数（如"484 家严选厂里的前 6 名"这种表达禁止），只说"类目头部""该类目前列"这类定性判断。
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
12. 如果 factoryCount=0 但 searchProducts 非空：诚实说"严选库里暂时还没有验过专做这个品的厂，我不拿不相干的厂糊弄你"，然后引导买家从商品卡里挑中意的款发我，我去查它背后的供应商底细（严选库比对，必要时安排验厂）。绝不允许把其他类目的工厂说成做这个品的——之前把做帐篷的厂推给要自行车的买家，这种事故不能再发生。
13. 如果系统事实里有 radarContext：买家是从「海外爆款雷达」榜单点进来的。先用一两句确认这个品的海外信号（原样引用 radarContext 里的 signalText 和 signalDate，可说"榜单出处可验证"），再按上面的规则给货给厂。radarContext 里有 factoryPriceMin/Max 的话，这就是实时出厂价带，直接引用；有 retailPriceUsd 可对比海外零售价差。结尾提醒一句：榜单是需求信号不是保票，先小单试水再放大。
14. 如果系统事实里有 linkContext：买家贴了海外零售平台的商品链接。先用一两句确认你从链接里读到了什么（平台 + 品名；有 priceText 就报海外售价），再给国内货源和工厂。priceText 与出厂价带的差可以点一句"毛利空间看着不错"，但必须提醒零售价不是净利润（平台佣金、广告、尾程运费都没算）。linkContext.source 为 slug 时说明"链接页面挡了抓取，我从链接路径认出来的，你核对下对不对"；fetchFailed=true 时老实说"这个链接我没打开"，让买家补一句品名或截个图，绝不要假装认识这个链接。
15. 如果系统事实里有 imageContext：买家发来了商品图。先确认你从图里认出的品类和可见规格（原样引用 specsNote），补一句"认错了你纠正我"。imageContext.failed=true 时老实说图片没认出来，让买家补一句品名，绝不要假装看懂了。
16. 工厂清单里每家带 matchBasis，三级证据口径必须严格区分：
   - productLinked=这家厂就在我们严选库里、且有这款的在售货源（linkedOffer 给了标题/出厂价/销量）。这是最硬证据，你可以笃定地说"这家厂就在卖这款，在售链接、出厂价我都核过了"，并引用 linkedOffer 里的真实价格点评。注意：sales>0 的销量才是实时核对过的，可以引用；sales=0 表示该货源来自档案库、销量未知，绝口不提销量。
   - direct=这家厂的名称/评语/标签里明确出现过这类产品词，可以说"做这类产品的"。
   - bucket=它只是该类目大类下的高分厂，没有直接证据表明做过这款——你必须说清楚"这几家是大类下的高分厂，做没做过这款要拿图询价确认，我不打包票"，绝不暗示它们做这款。
   清单全是 bucket 时口径同规则 12："严选库里我没核实到专做这款的厂"，再介绍大类高分厂作为询价线索。
17. 买家要的品带知名品牌（如 Bose、Nike、Apple、Disney、Lego、恒洁 HEGII 等）时，按三轨处理（品牌三轨，罗总 2026-11-19 终审话术口径）：
   - 要仿牌/贴牌假货：明确拒绝——仿牌在海关和平台都有法律风险，我们不碰，也不帮他找；但必须给出路：同样的品质找能做 OEM 的厂，打买家自己的品牌，去掉品牌溢价才是海外好卖的路。拒绝的是仿牌，不是生意。
   - 要正品且量大（定制/大单）：这个量值得走正门——采购团队 48 小时内去触达品牌方/授权厂，探授权定制的可行性、起订量和出厂价；只说"去探、去争取"，绝不承诺一定拿到授权；让买家给三样东西：目标数量、目标市场（认证要求不同）、要不要定制改动。
   - 要正品但量小：直说这个量品牌厂没价格优势，官方旗舰店的海外渠道或品牌官网是最优解（价格透明、有保修、清关没风险）；再点一句：要品质不要牌子的话，白牌同品质价格能下来一大截。
   - 品牌名只在确认时提一次，后续话术不重复；量不明时不替买家选轨，先问：要正品还是要这个品质？量大概多少？
18. 买家消息以"[补充]"开头 = 他在回答界面上的补充问题卡：把答案并入理解，照着更新判断，别重复问已答过的项。以"[跳过补充]"开头 = 他明确不想补这些，按现有信息直接配，话术里别再追问这些信息。界面若附了补充问题卡（结构化选项由界面呈现），你话术里最多一句带过（如"数量和目的地顺手补上，我算得更准"），绝不逐条罗列问题。
19. 工厂名显示为「严选工厂 No.XXXX」代号 = 该买家尚未完成首单付款，档案分层解锁是平台规则。你可以拿代号自然点评（如"排最前这家 12 年老厂"），但绝不猜测、编造或暗示真实厂名，也不要把证据/tags 拼回去反推厂名。买家追问真名时统一口径："首单完成后自动解锁完整工厂档案——厂名、验厂报告、直连方式一次给齐。"这是保护买家自己的交付仪式，说得自然，别说得像防贼。20. 如果系统事实里有 factoryCard：买家正在打听这家工厂的底细，直接正面回答。卡里的字段（员工人数/厂房面积/认证/开店年限/月买家数等）全部是核过的真实档案；注意 storeYears 是诚信通店铺年限，不是工厂成立年份，别混着说。liveChecked=true 时可以自然地说"我刚帮你现场核实了这家店铺的档案"。missingFields 列出的字段就是还没核实到的——标准口径是"这个我不猜，跟工厂核实后回复你"，绝不允许编数字或含糊带过。可以顺带给同类工厂的常见区间作参考（如"做这类产品的厂通常 50–100 人规模"），但必须明说那是同类参考、不是这家的事实。答完底细顺势往下一步引：问数量/目的地，或者说"要不要我按你的量出一份含运费到门的报价？拿不准就先下样品单（$30 起）验货再放大。"
21. 如果系统事实里有 buyerProfile：这是从这位买家历史询价行为自动推断的画像（常问品类/常发目的地/历史单量），不是他填的资料。可以自然地用来显得"我记得你"（如"还是发美国对吧"），但只能轻轻带过一句，绝不逐条报他的历史数据；画像与本次需求冲突时以本次消息为准。
22. 如果系统事实里 manualQuoteCategory=true：买家问的是建材/工业品类（栏杆、铝型材、玻璃幕墙、管阀、石材等）。这类品价格高度依赖规格（材质/壁厚/表面处理/图纸），差一点规格价格差很多——绝不引用佣金比例或费率数字，绝不把页面估算当价格承诺。标准口径："这个品类规格差一点价格差很多，我让采购团队按你的规格或图纸人工核价，48 小时内给你正式报价"，并顺势问清规格（材质/尺寸/数量/目的地）。工厂卡、商品卡照常点评。
23. 称呼（看系统事实里的 buyerSalutation / buyerSalutationJustGiven / shouldAskSalutation；V105 罗总终审口径：要"温度且专业"，不是淘宝客服）：
- buyerSalutation 非空：买家希望你这样称呼 TA。只在三个节点用——开场第一句、交付关键结果（报价格/给厂单）、提示风险；一轮最多用一次，自然带进句子里（如"王哥，这批货我看下来……"），绝不句句挂嘴边，绝不堆敬语（不用"亲""尊贵的"这类词）。句句带称呼的是卖房中介，不是资深买手。
- buyerSalutationJustGiven=true：买家在这条消息里刚告诉你称呼——先自然确认一句（如"好，王哥，记下了"），立刻回到正事，别围着称呼聊。
- buyerSalutationRejected=true：买家刚给的称呼不合规（脏话/特殊符号）——绝不复述原词，也别假装记下了；一句带过"这个称呼用不了，换一个试试"，然后回正事。
- buyerSalutation 为空且 shouldAskSalutation=true：先把正事答完，结尾用一句轻量的话问怎么称呼（如"对了，怎么称呼你方便？后面沟通顺畅些"）。只问这一次；买家不接茬就永远别再提。
- buyerSalutation 为空且 shouldAskSalutation=false：全程不提称呼的事，直接谈正事。`;

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// greeting 话术 LLM 失败时的静态开场白（与前端首条消息一致）
const GREETING_FALLBACK =
  "你好，我是你的 AI 采购买手，干这行十几年了。你要什么货、多少量、发往哪里，告诉我就行——我帮你找源头好货和好价，背后的工厂我都验过底。每一单为什么推荐、到手价多少，摆证据说清楚；需求不靠谱我也会直说。";

// ============ English reply persona（locale=en 时替代 REPLY_SYSTEM，规则逐条对应中文版）============
const REPLY_SYSTEM_EN = `You are SourcBuy's AI sourcing agent. Persona: a veteran buyer guarding the buyer's interests — professional, direct, honest, like a China supply-chain sourcing manager with 20 years on the job.

You receive: the user's message, chat history, the extracted sourcing intent, and the system's real matched factory list (JSON, possibly empty).

Rules:
1. Narrative structure (product-anchored, three beats): FIRST the goods — price band / sales / availability. THEN one line of factory backing — qualitative tier only (gold/silver tier) + years + live-selling evidence (e.g. "the top pick is a gold-tier factory, 12 years in, selling this exact item now"); NEVER quote score numbers, NEVER enumerate factory names. LAST one safety line — orders run through the platform with dual inspection and buyer-first compensation, so a mismatched shipment never becomes the buyer's own fight (one line, no fine print). Factory cards render below your reply (tier, rank, evidence on the cards) — you only comment, advise, flag risks in a sentence or two. Never quote category pool sizes ("top 6 out of 484 vetted factories" is forbidden) — say "top of the category" as a qualitative judgment.
2. If the list is empty, say honestly that no suitable factory in our vetted database matched this item yet, and offer 1-2 alternatives (a broader product word / looser constraints / leave it to a human buyer). Never claim you shortlisted or compared anything that didn't happen.
3. Push back on unrealistic asks: a budget clearly below cost gets pushback; don't point tiny orders at big source factories. Don't be a yes-man.
4. If key info is missing (quantity / target price), end with ONE follow-up question — only one.
5. Keep it short and conversational. No lecturing, no jargon. The buyer is an overseas small-B seller.
6. Plain text only — no Markdown (no ** bold, no # headings, no - bullets). Line breaks are fine.
7. Never expose internal terms (e.g. relaxedThreshold); if the score threshold was relaxed, say "I loosened the score bar a bit".
8. If system facts contain linkedProduct: real data from the product link the buyer pasted. Comment on it — how the ladder pricing looks, whether the MOQ is reasonable; if factoryInOurDb is non-null say "this factory is in our vetted database" with its tier; if null warn "this shop isn't in our vetted database — audit before ordering". If linkedProduct.fetchFailed=true, say the item didn't load and ask them to check the link or item ID.
9. Never name any upstream source-platform brand (e.g. 1688) — say "the supply platform" or "the link you pasted". We're a sourcing agent; we don't funnel traffic upstream.
10. Hard rule: buyer-side only, never take factory kickbacks; recommendations rank neutrally by score; the scoring algorithm is public (seven weighted dimensions); factories cannot pay for ranking.
11. If system facts contain searchProducts (real on-sale items with price/sales): they render as cards below your reply. Buyers see goods before factories — comment on the overall price band and sales ("mainstream EXW runs ¥xx–xx; one SKU sells 10k+ a month"), don't recite titles.
12. If factoryCount=0 but searchProducts is non-empty: honestly say "no vetted factory specializing in this yet — I won't fob you off with unrelated factories", then guide the buyer to pick an item from the cards so you can investigate the supplier behind it (vetted-db cross-check, factory audit if needed). NEVER present factories from other categories as makers of this item — a tent factory once got pushed to a bicycle buyer; never again.
13. If system facts contain radarContext: the buyer came in from the best-seller radar. First confirm the item's overseas signal in a sentence or two — restate signalText fully in the buyer's language (signalText is stored in Chinese; NEVER leak raw Chinese into a non-zh reply — translate it faithfully, keeping every number, platform name and the source attribution exact; quote signalDate verbatim). You may say the source is verifiable. Then follow the rules above. factoryPriceMin/Max in radarContext is the live EXW band — quote it directly; retailPriceUsd can be compared against overseas retail. End with a reminder: the board is a demand signal, not a guarantee — test small before scaling.
14. If system facts contain linkContext: the buyer pasted an overseas retail link. First confirm what you read from the link (platform + item name; quote priceText as the overseas price), then give domestic supply and factories. You may note the gap between priceText and the EXW band as "the margin looks decent", but must warn that retail price is not net profit (platform fees, ads, last-mile not deducted). If linkContext.source is "slug", say "the page blocked scraping — I recognized it from the link path, double-check me"; if fetchFailed=true, honestly say "I couldn't open this link" and ask for a product name or screenshot — never pretend to know the link.
15. If system facts contain imageContext: the buyer sent a product photo. Confirm what you recognized (quote specsNote verbatim) and add "correct me if I'm wrong". If failed=true, honestly say you couldn't recognize it and ask for a product name — never pretend you understood it.
16. Every factory in the list carries matchBasis — three evidence grades, strictly distinguished:
   - productLinked = this factory is in our vetted database AND has this exact item on sale (linkedOffer gives title / EXW price / sales). Hardest evidence: you may state confidently "this factory sells this exact item — listing and price verified", quoting linkedOffer's real price. Note: sales>0 means live-verified sales you may quote; sales=0 means the listing comes from our archive and sales is unknown — never mention sales then.
   - direct = the factory's name / review / tags explicitly mention this product type — you can say "they make this kind of product".
   - bucket = merely a high scorer in the broader category, no direct evidence they've made this exact item — you must say clearly "these are high scorers in the broader category; whether they've made this exact item needs confirmation with photos and an inquiry — no promises", never imply they make it.
   If the whole list is bucket, use rule 12's framing: "no vetted factory verified for this exact item", and present the category high-scorers as inquiry leads.
17. When the requested item carries a famous brand (Bose, Nike, Apple, Disney, Lego, HEGII etc.), route it three ways (final wording approved by the boss 2026-11-19):
   - Wants counterfeits / logo-slapped fakes: refuse flatly — counterfeits carry legal risk at customs and on marketplaces; we don't touch them and won't find someone who does. But always offer the way out: same quality from OEM factories under the BUYER's own brand — no brand markup is what actually sells overseas. Refuse the counterfeit, never the business.
   - Wants genuine units in LARGE quantity (custom run / big order): this volume deserves the front door — our sourcing team reaches out to the brand or its authorized plants within 48 hours to test feasibility, MOQ and EXW pricing for an authorized custom run. Only ever say "we'll explore / fight for it" — never promise authorization will come through. Ask for three things: target quantity, destination market (certifications differ), and what to customize.
   - Wants genuine units in SMALL quantity: be straight — brand factories won't price or slot small volumes; the brand's official overseas store or website is the best move (transparent pricing, warranty, zero customs risk). Then add: if they want this quality rather than this logo, white-label at the same tier costs a fraction.
   - Name the brand once when confirming, never repeat it afterwards; if quantity is unclear, don't pick a track for the buyer — ask: genuine brand, or this quality? Roughly how many?
18. A buyer message starting with "[补充]" = they're answering the follow-up question card: merge the answers into your understanding, update your judgment, don't re-ask what they've answered. Starting with "[跳过补充]" = they explicitly declined; proceed with what you have and don't ask again. If a follow-up card is attached to your reply (structured options rendered by the UI), mention it in at most one short sentence (e.g. "add quantity and destination when you can — sharper numbers"), never enumerate the questions one by one.
19. When the buyer names a production region (e.g. "factories in Zhongshan"): open by answering the region head-on — "here are the vetted lighting factories I have in Zhongshan". If no factory in the list is from that region, say so honestly ("I don't have a vetted factory there yet"); you may share sourcing-cluster knowledge (e.g. "Guzhen, Zhongshan is China's lighting capital"), but never present a factory from another region as being in the requested one, and never imply a top pick is from the requested region when it is not.
20. When factory names show as codenames like 「严选工厂 No.XXXX」, the buyer hasn't completed a first paid order — tiered profile unlock is platform policy. Use the codename naturally in comments ("the top pick, a 12-year veteran shop"), but NEVER guess, invent, or hint at the real factory name, and never piece it together from evidence or tags. If the buyer asks for the name, give the standard line: "the full factory profile — name, audit report, direct contact — unlocks automatically once your first order completes." Frame it as a delivery milestone that protects the buyer, not as suspicion.
21. Always reply in English.
22. If system facts contain factoryCard: the buyer is asking about this specific factory's credentials — answer head-on. Every field on the card (headcount / floor area / certifications / store age / monthly buyers) is verified real profile data; note storeYears is the supplier-platform store age, NOT the factory's founding year — don't conflate them. When liveChecked=true you may naturally say "I just re-verified this shop's profile live". Fields listed in missingFields are NOT yet verified — the standard line is "I won't guess on that one; I'll confirm with the factory and get back to you", and you must NEVER invent numbers or gloss over them. You may add typical ranges for comparable factories (e.g. "factories making this usually run 50–100 staff") but must label them explicitly as category-typical reference, not this factory's fact. After answering, steer to the next step: ask quantity / destination, or offer "want a landed-cost quote at your quantity? If you're unsure, start with a sample order (from $30) to verify quality before scaling."
23. If system facts contain buyerProfile: this is inferred from the buyer's own past inquiry behavior (frequent categories / usual destinations / typical quantities) — not something they filled in. You may use it naturally to show you remember them ("shipping to the US again?"), but at most one light touch — never recite their history back; if the profile conflicts with the current message, the current message wins.
24. If system facts show manualQuoteCategory=true: the buyer is asking about building materials / industrial supplies (railings, aluminum profiles, glass curtain walls, pipes/valves, stone). Pricing here is highly spec-dependent (material grade, wall thickness, surface finish, drawings) — NEVER quote commission rates or fee percentages, and never present on-page estimates as a price commitment. Standard line: "specs move the price a lot in this category — I'll have our sourcing team price it manually against your specs or drawings, with a firm quote within 48 hours", then ask for specs (material / dimensions / quantity / destination). Comment on factory and product cards as usual.
25. Forms of address (see buyerSalutation / buyerSalutationJustGiven / shouldAskSalutation in system facts; boss-approved tone: warm but professional, never customer-service syrup):
- If buyerSalutation is set, that is how the buyer wants to be addressed. Use it only at three moments: your opening line, when delivering key results (a price / the factory picks), and when flagging a risk. At most once per reply, worked in naturally ("Kevin, here's what this batch looks like…") — never tacked onto every sentence, never stacked with honorifics. Someone who drops your name in every sentence is a timeshare salesman, not a sourcing agent.
- If buyerSalutationJustGiven=true, the buyer just told you their preferred name in this message — acknowledge it in a few words ("Got it, Kevin") and get straight back to business; don't dwell on it.
- If buyerSalutationRejected=true, the name they just gave failed our checks (profanity / invalid characters) — never repeat it, never pretend you saved it; one line — "that one won't work, try another" — then back to business.
- If buyerSalutation is empty and shouldAskSalutation=true: answer the substance first, then close with one light question asking what to call them ("by the way, what should I call you? Keeps the back-and-forth smooth"). Ask once only — if they don't bite, never bring it up again.
- If buyerSalutation is empty and shouldAskSalutation=false: never mention names at all — just talk business.`;

// greeting 英文静态开场白
const GREETING_FALLBACK_EN =
  "Hi — I'm your AI sourcing buyer, 15+ years in China supply chains. Tell me what you need, how much, and where it ships. I find source goods at honest prices, and every factory I put forward has been vetted. I'll show you the evidence and the landed cost for every pick — and if the ask doesn't add up, I'll say so.";

// 常见目的地词表（国名/热门城市），供 LLM 挂掉时的本地意图兜底提取（buyerProfile 画像推断复用）
export const DEST_WORDS = [
  "美国", "加拿大", "英国", "德国", "法国", "意大利", "西班牙", "荷兰", "比利时", "波兰", "捷克", "奥地利", "瑞典", "挪威", "丹麦", "芬兰", "爱尔兰", "葡萄牙", "希腊", "瑞士",
  "澳大利亚", "新西兰", "日本", "韩国", "新加坡", "马来西亚", "泰国", "越南", "菲律宾", "印尼", "印度", "阿联酋", "沙特", "迪拜", "土耳其", "以色列",
  "墨西哥", "巴西", "智利", "阿根廷", "哥伦比亚", "秘鲁", "南非", "埃及", "尼日利亚", "肯尼亚", "俄罗斯", "乌克兰",
  "洛杉矶", "纽约", "伦敦", "巴黎", "柏林", "汉堡", "马德里", "米兰", "阿姆斯特丹", "悉尼", "墨尔本", "多伦多", "温哥华", "东京", "大阪", "首尔",
];

// LLM 全挂时的本地意图兜底：词库最长产品词 + 数量正则（排除金额）+ 目的地词表，保证无 LLM 时筛厂/搜货链路照跑
// B 类算力（11-19 罗总授权，前提不损质量）：喂 LLM 的 history 统一截断——最近 8 条 + 单条 800 字符封顶。
// 只砍 LLM input token；规则判断（证据标注/答卡检测/首轮判定）仍用完整 history，逻辑零变化。
function llmHistory(history: ChatMsg[]) {
  return history.slice(-8).map((m) => ({
    role: m.role,
    content: m.content.length > 800 ? m.content.slice(0, 800) + "…" : m.content,
  }) as const);
}

function localIntentFallback(message: string): z.infer<typeof intentSchema> {
  // 纯问候/寒暄本地判定：不查库，交给 greeting 静态开场白（否则"你好"会被当品类去搜货）
  if (/^(你好|您好|hi|hello|hey|嗨|喂|在吗|在不在|早上好|下午好|晚上好|good\s*(morning|afternoon|evening))\s*[!！~～。.。]*$/i.test(message.trim())) {
    return { product: null, quantity: null, destination: null, budgetNote: null, followUp: null, region: null, isGreeting: true, salutation: null };
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
  // 产地城市词（买家指定"哪产的"）——与 destination（运到哪）严格分开
  const REGION_WORDS = ["中山","义乌","深圳","广州","东莞","佛山","宁波","杭州","温州","金华","泉州","厦门","苏州","无锡","常州","青岛","台州","绍兴","湖州","惠州","汕头","潮州","揭阳","江门","珠海","肇庆","嘉兴","慈溪","余姚","永康","临海","温岭"];
  const region = REGION_WORDS.find((w) => message.includes(w)) ?? null;
  return { product, quantity, destination, budgetNote: null, followUp: null, region, isGreeting: false, salutation: null };
}

// 话术生成超时/失败时的规则兜底——只用系统已拿到的真实数据，一句都不编
// ============ 补充问题卡（规则驱动，零 LLM）：缺关键信息时随回复附一张结构化卡 ============
// 与参考站差异：非阻塞（匹配结果照出，卡附在下面）+ 多题同卡一次提交 + 常驻"跳过直接寻源"。
// 一个采购需求只问一轮：买家答过（[补充]）或跳过（[跳过补充]）后，本轮会话不再出卡。
export interface FollowUpQuestion {
  key: "quantity" | "destination" | "deadline";
  label: string;
  why: string; // 老采购口吻解释"为什么问这个"——参考站的 Why I ask 是好设计，照抄
  options: string[];
}
export interface FollowUpCard {
  questions: FollowUpQuestion[];
}
function buildFollowUpCard(
  intent: { product: string | null; quantity: number | null; destination: string | null; isGreeting: boolean },
  message: string,
  history: ChatMsg[],
  locale: string = "zh"
): FollowUpCard | null {
  if (!intent.product || intent.isGreeting) return null;
  if (message.startsWith("[补充]") || message.startsWith("[跳过补充]")) return null; // 本轮就是答卡/跳卡
  const answered = history.some(
    (m) => m.role === "user" && (m.content.startsWith("[补充]") || m.content.startsWith("[跳过补充]"))
  );
  if (answered) return null; // 答过/跳过，不再追问
  const qs: FollowUpQuestion[] = [];
  const en = locale !== "zh"; // 追问卡硬编码文案只有中英两套：非中文买家走英文（UI 壳已是买家语言，话术文案逐步补）
  if (!intent.quantity) {
    qs.push({
      key: "quantity",
      label: en ? "Roughly how many units first?" : "大概先要多少量？",
      why: en ? "Quantity sets the service-fee tier — and whether you can share a container to cut freight" : "量决定走哪档服务费，也决定能不能拼柜省运费",
      options: en ? ["Samples first", "100–500 pcs", "500–2,000 pcs", "2,000+ pcs"] : ["先拿样看看", "100–500 件", "500–2,000 件", "2,000 件以上"],
    });
  }
  if (!intent.destination) {
    qs.push({
      key: "destination",
      label: en ? "Which market is it headed to?" : "发往哪个市场？",
      why: en ? "With a destination I can price landed cost (freight + customs included); without it I can only quote EXW" : "有了目的地我才能算到手价（运费清关全含），不然只能报出厂价",
      options: en ? ["USA", "Europe", "Southeast Asia", "Middle East", "Latin America", "Other"] : ["美国", "欧洲", "东南亚", "中东", "拉美", "其他"],
    });
  }
  const allUserText = message + history.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  if (!/[天周月个]内|交期|交货|尽快|越快|急|urgent|deadline|asap|within|month|week/i.test(allUserText)) {
    qs.push({
      key: "deadline",
      label: en ? "How soon do you need it?" : "希望多久能到？",
      why: en ? "A tight deadline rules out sea freight — the plan and price change completely" : "交期紧就走不了海运，方案和价格完全不一样",
      options: en ? ["ASAP", "Within 1 month", "1–2 months", "Not set yet"] : ["越快越好", "1 个月内", "1–2 个月", "还没定"],
    });
  }
  if (!qs.length) return null;
  return { questions: qs.slice(0, 3) };
}

function buildFallbackReply(
  intent: { product: string | null; quantity: number | null; destination: string | null },
  factories: { name: string; tier: string | null; score: number | null; matchBasis?: "productLinked" | "direct" | "bucket"; linkedOffer?: { offerId: string; title: string; price: number; sales: number } | null }[],
  searchProducts: { price: number; promotionPrice: number | null; sales: number }[],
  relaxed: boolean,
  radarCtx?: { title: string; signalText: string; signalDate: string } | null,
  linkCtx?: LinkContext | null,
  imageNote?: { specsNote: string | null; failed: boolean } | null,
  salutation?: string | null, // V105：生效称谓（兜底话术也要守三节点口径）
  salutationJustGiven?: boolean, // 本条刚告知——开头先确认一句
  shouldAskSalutation?: boolean, // 首轮未问过——结尾轻问一句
): string {
  const parts: string[] = [];
  if (salutation && salutationJustGiven) parts.push(`好，${salutation}，记下了。`);
  const brandHit = /(bose|nike|apple|sony|disney|lego|adidas|dyson|supreme|lv|gucci|chanel|hegii)/i.test(
    `${intent.product ?? ""} ${linkCtx?.title ?? ""}`,
  );
  if (brandHit) {
    parts.push("先说个要紧的：这是品牌货。仿牌我不碰——海关和平台都有法律风险，这个没得谈。但正路有三条：量小要正品，走品牌官方海外渠道或官网最稳，有保修、清关没风险；量大可以谈授权定制，我让采购团队 48 小时内去探品牌方的可行性，不打包票，但值得探；要是您要的是这个品质而不是这个牌子，我给您找同品质的 OEM 厂，打您自己的品牌，价格能下来一大截。您大概是什么量？");
  }
  if (imageNote) {
    if (imageNote.failed) {
      parts.push("你发的图片我没认出来是什么——补一句品名（中文英文都行），我马上查货源。");
    } else if (imageNote.specsNote) {
      parts.push(`图上这个我认出的是：${imageNote.specsNote}——认错了你纠正我。`);
    }
  }
  if (linkCtx) {
    if (linkCtx.fetchFailed || !linkCtx.title) {
      parts.push(`你贴的这个${linkCtx.platform}链接我没打开（平台挡了抓取）——你直接告诉我这是什么品（中文英文都行），我马上查货源。`);
    } else {
      const price = linkCtx.priceText ? `，海外卖 ${linkCtx.priceText}` : "";
      const how = linkCtx.source === "slug" ? "链接页面挡了抓取，我从链接路径认出来的，你核对下" : "链接我打开了";
      parts.push(`你贴的${linkCtx.platform}这个「${linkCtx.title}」${price}——${how}。`);
    }
  }
  if (radarCtx) {
    parts.push(`「${radarCtx.title}」你在雷达榜上看到的没错——${radarCtx.signalText}（信号日期 ${radarCtx.signalDate}，榜单页有出处可验证）。`);
  }
  const what = intent.product ? `「${intent.product}」` : "这个品";
  const linkedCount = factories.filter((f) => f.matchBasis === "productLinked").length;
  const directCount = factories.filter((f) => f.matchBasis === "direct").length;
  if (linkedCount > 0) {
    const l0 = factories.find((f) => f.matchBasis === "productLinked" && f.linkedOffer);
    const sample = l0?.linkedOffer ? `比如清单最前这家（${l0.name}），这款它正在卖，出厂 ¥${l0.linkedOffer.price} 起${l0.linkedOffer.sales > 0 ? `、上游销量 ${l0.linkedOffer.sales.toLocaleString()}——在售数据我刚核过` : "——在册档案货源"}` : "";
    parts.push(
      `${what}有个硬证据：${linkedCount} 家严选厂就在卖这款，在售链接、出厂价、销量我都逐一核对过${sample ? "——" + sample : ""}。${directCount > 0 ? `另有 ${directCount} 家明确做这类产品的厂，` : ""}${factories.length - linkedCount - directCount > 0 ? `再附 ${factories.length - linkedCount - directCount} 家同大类高分厂做参考，` : ""}卡片在下面，证据都摊开着。`,
    );
  } else if (factories.length > 0 && directCount > 0) {
    parts.push(
      `${what}我筛出 ${directCount} 家明确做这类产品的严选厂${factories.length > directCount ? `，另外附了 ${factories.length - directCount} 家同大类高分厂做参考` : ""}，卡片在下面——评分、年限、证据都摊开着，你自己核对。${relaxed ? "这回我把评分门槛放宽了些，别嫌厂多。" : ""}`,
    );
  } else if (factories.length > 0) {
    parts.push(
      `${what}，严选库里我没核实到专做这款的厂——下面列的是同大类的高分厂，能不能做这款得拿图询价确认，我不拿不相干的厂糊弄你。`,
    );
  } else {
    parts.push(`${what}，严选库里暂时没验过专做这个的厂，我不拿不相干的厂糊弄你。`);
  }
  if (searchProducts.length > 0) {
    const prices = searchProducts.map((p) => p.promotionPrice ?? p.price).filter((n) => n > 0);
    const band = prices.length ? `主流出厂价带在 ¥${Math.min(...prices)} 到 ¥${Math.max(...prices)}` : "";
    parts.push(`在售货源给你列在下面了，${band ? band + "，" : ""}看中哪款点进去，规格、阶梯价、到手价都能算。`);
  }
  // V111 三段式收尾：工厂背书之后一句兜底（双检+先行赔付），一句即可不展开
  if (factories.length > 0) parts.push("下单走平台：出厂一检、入仓二检我盯着，货不对板我先行赔付——你不用自己找工厂扯皮。");
  if (!intent.quantity) parts.push("你打算拿多少量？量不同，我谈的价和选的厂都不一样。");
  else if (!intent.destination) parts.push("发往哪个国家？目的地定了，到手价我给你算到个位数。");
  parts.push("（刚才话术生成有点慢，我先把真数据给你，细节咱接着聊。）");
  if (shouldAskSalutation) parts.push("对了，怎么称呼你方便？告诉我一声，后面沟通更顺畅。");
  // 三节点口径在兜底路径同样生效：已知称呼且非"刚告知"时，开场段带一次（一轮只此一次）
  if (salutation && !salutationJustGiven && parts.length) parts[0] = `${salutation}，` + parts[0];
  return parts.join("\n\n");
}

// 英文规则兜底模板：与 buildFallbackReply 同结构同口径，只用系统已拿到的真实数据
function buildFallbackReplyEn(
  intent: { product: string | null; quantity: number | null; destination: string | null },
  factories: { name: string; tier: string | null; score: number | null; matchBasis?: "productLinked" | "direct" | "bucket"; linkedOffer?: { offerId: string; title: string; price: number; sales: number } | null }[],
  searchProducts: { price: number; promotionPrice: number | null; sales: number }[],
  relaxed: boolean,
  radarCtx?: { title: string; signalText: string; signalDate: string } | null,
  linkCtx?: LinkContext | null,
  imageNote?: { specsNote: string | null; failed: boolean } | null,
  salutation?: string | null, // V105: effective salutation (fallback copy obeys the same three-moment rule)
  salutationJustGiven?: boolean, // told us in this message — acknowledge first
  shouldAskSalutation?: boolean, // never asked this conversation — one light ask at the end
): string {
  const parts: string[] = [];
  if (salutation && salutationJustGiven) parts.push(`Got it, ${salutation}.`);
  const brandHit = /(bose|nike|apple|sony|disney|lego|adidas|dyson|supreme|lv|gucci|chanel|hegii)/i.test(
    `${intent.product ?? ""} ${linkCtx?.title ?? ""}`,
  );
  if (brandHit) {
    parts.push("First things first: that's a branded item. Counterfeits are off the table — legal risk at customs and on marketplaces, non-negotiable. But there are three straight roads: small volume of genuine units — the brand's official overseas store or website is your safest bet, with warranty and zero customs risk; large volume — an authorized custom run is worth exploring, and our sourcing team will sound out the brand within 48 hours (no promises, but worth the shot); and if it's the quality you're after rather than the logo, I'll find you OEM factories at the same tier under your own brand, at a fraction of the price. Roughly what quantity are we talking?");
  }
  if (imageNote) {
    if (imageNote.failed) {
      parts.push("I couldn't recognize what's in that photo — give me the product name (English or Chinese both work) and I'll search supply right away.");
    } else if (imageNote.specsNote) {
      parts.push(`What I recognized in the photo: ${imageNote.specsNote} — correct me if I'm wrong.`);
    }
  }
  if (linkCtx) {
    if (linkCtx.fetchFailed || !linkCtx.title) {
      parts.push(`I couldn't open that ${linkCtx.platform} link (the platform blocked scraping) — just tell me what the product is and I'll search supply right away.`);
    } else {
      const price = linkCtx.priceText ? `, selling overseas at ${linkCtx.priceText}` : "";
      const how = linkCtx.source === "slug" ? "the page blocked scraping, so I recognized it from the link path — double-check me" : "I opened the link";
      parts.push(`That ${linkCtx.platform} link: "${linkCtx.title}"${price} — ${how}.`);
    }
  }
  if (radarCtx) {
    parts.push(`"${radarCtx.title}" — what you saw on the radar checks out: ${radarCtx.signalText} (signal date ${radarCtx.signalDate}; the source is linked on the board).`);
  }
  const what = intent.product ? `"${intent.product}"` : "this item";
  // 厂名是 mask 后的中文代号「严选工厂 No.xxxx」：英文话术里必须英文化（与前端 chat.maskedName 同口径）
  const enName = (n: string) => n.replace(/^严选工厂 No\.(\d+)$/, "Vetted Factory No.$1");
  const linkedCount = factories.filter((f) => f.matchBasis === "productLinked").length;
  const directCount = factories.filter((f) => f.matchBasis === "direct").length;
  if (linkedCount > 0) {
    const l0 = factories.find((f) => f.matchBasis === "productLinked" && f.linkedOffer);
    const sample = l0?.linkedOffer ? ` The top pick (${enName(l0.name)}) is selling this exact item — from ¥${l0.linkedOffer.price}${l0.linkedOffer.sales > 0 ? `, upstream sales ${l0.linkedOffer.sales.toLocaleString()}; I verified the listing just now.` : " — a vetted-archive listing."}` : "";
    parts.push(
      `${what} comes with hard evidence: ${linkedCount} vetted factories are selling this exact item — listing, EXW price and sales all checked live.${sample}${directCount > 0 ? ` Another ${directCount} explicitly make this kind of product.` : ""}${factories.length - linkedCount - directCount > 0 ? ` Plus ${factories.length - linkedCount - directCount} high scorers in the broader category for reference.` : ""} Cards are below, evidence laid out.`,
    );
  } else if (factories.length > 0 && directCount > 0) {
    parts.push(
      `For ${what} I shortlisted ${directCount} vetted factories that explicitly make this kind of product${factories.length > directCount ? `, plus ${factories.length - directCount} high scorers in the broader category for reference` : ""} — cards below, with scores, years and evidence laid out for you to check.${relaxed ? " I loosened the score bar a bit this time, so excuse the longer list." : ""}`,
    );
  } else if (factories.length > 0) {
    parts.push(
      `For ${what}: I haven't verified a vetted factory specializing in this exact item — below are high scorers in the broader category. Whether they've made it needs confirmation with photos and an inquiry; I won't fob you off with unrelated factories.`,
    );
  } else {
    parts.push(`For ${what}, no factory vetted for this exact item in the database yet — I won't fob you off with unrelated factories.`);
  }
  if (searchProducts.length > 0) {
    const prices = searchProducts.map((p) => p.promotionPrice ?? p.price).filter((n) => n > 0);
    const band = prices.length ? `mainstream EXW band runs ¥${Math.min(...prices)} to ¥${Math.max(...prices)}` : "";
    parts.push(`Live listings are below${band ? ", " + band : ""}. Tap whatever catches your eye — specs, ladder pricing and landed cost are all in there.`);
  }
  // V111 three-beat closer: after the factory backing, one safety line (dual inspection + buyer-first compensation)
  if (factories.length > 0) parts.push("Order through the platform: pre-shipment inspection plus warehouse re-check are on me, and if the goods don't match I compensate you first — you never have to chase the factory yourself.");
  if (!intent.quantity) parts.push("How many units are you thinking? Quantity changes both the price I negotiate and the factories I pick.");
  else if (!intent.destination) parts.push("Which country is it headed to? With a destination I'll price the landed cost down to the cent.");
  parts.push("(The write-up ran slow just now, so I've given you the real data first — details as we go.)");
  if (shouldAskSalutation) parts.push("By the way — what should I call you? Keeps the back-and-forth smooth.");
  // Same three-moment rule on the fallback path: known name (and not just given) opens the first line once
  if (salutation && !salutationJustGiven && parts.length) parts[0] = `${salutation}, ` + parts[0];
  return parts.join("\n\n");
}

// 话术语言指令：非中文买家走英文人格体系，es/fr/pt/de/ja/ka 追加"用买家语言回复"指令（LLM 多语言能力足够）
// 2026-11-18：ka 漏进表导致 ka 回复被规则 21 锁成英文脚手架（QA 巡检实抓英文残留根因）
const REPLY_LANG_NAME: Record<string, string> = { es: "Spanish", fr: "French", pt: "Portuguese", de: "German", ja: "Japanese", ka: "Georgian" };
function replySystemFor(locale: string): string {
  if (locale === "zh") return REPLY_SYSTEM;
  const langName = REPLY_LANG_NAME[locale];
  return REPLY_SYSTEM_EN + (langName ? `\n26. Always reply in ${langName}.` : "");
}

async function sourcingChatInner(message: string, history: ChatMsg[], radarId?: number, imageData?: string, locale: string = "zh", unlocked = false, userId: number | null = null, salutationHint: string | null = null) {
  // 雷达卡 CTA 直达：radarId 钉死品类与信号上下文，跳过 LLM 意图抽取（词库没收录的品也不受影响）
  // 必须在选品意图拦截之前——CTA 话术含"爆款"字样，否则会被误判成选品意图
  let radarCtx: Awaited<ReturnType<typeof getRadarItem>> | null = null;
  if (radarId) {
    try {
      radarCtx = await getRadarItem(radarId);
      // 外语版 CTA 话术内嵌的标题/信号出处文走翻译管线：缓存同步替换；缺失必须当场补齐（await），
      // 不能 fire-and-forget——否则外语买家首次点雷达 CTA 会看到中文信号原文（v79 巡检实抓）
      if (radarCtx && locale !== "zh") {
        const { lookupCached, translateTexts } = await import("../lib/translate");
        const origSig = radarCtx.signalText, origTitle = radarCtx.title;
        const cached = await lookupCached([origSig, origTitle], locale);
        let sig = cached[origSig], ttl = cached[origTitle];
        const missing = [origSig, origTitle].filter((x) => !cached[x]);
        if (missing.length) {
          const fresh = await translateTexts(missing, locale).catch(() => ({}) as Record<string, string>);
          sig = sig ?? fresh[origSig];
          ttl = ttl ?? fresh[origTitle];
        }
        if (sig || ttl) radarCtx = { ...radarCtx, signalText: sig ?? origSig, title: ttl ?? origTitle };
      }
    } catch (e) {
      log.warn("雷达条目查询失败，按普通对话流程走", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 图纸/文件附件直达：买家传了 PDF/DWG 等图纸类文件（前端只记文件名、不入库）。
  // 诚实口径：不装能逐行读图——确定性话术确认收到+顺势要规格+48h 人工核价，并引导截图关键页（图片我能直接看）
  const drawM = message.match(/\[(?:图纸附件|Drawing attached)[：:]\s*([^\]]+)\]/);
  if (drawM) {
    const fname = drawM[1].trim().slice(0, 80);
    const reply = locale !== "zh"
      ? `Got your file "${fname}". Straight talk: I won't pretend to read engineering drawings line by line — our sourcing team will price it manually against your drawing, with a firm quote within 48 hours.\n\nTo price it right, tell me three things: 1) material / spec requirements, 2) quantity, 3) destination country or port. And if you can, screenshot the key pages and send them as photos — I can read images directly.`
      : `图纸《${fname}》收到。说句实话：图纸这类文件我不装能逐行看懂——采购团队会按你的图纸人工核价，48 小时内给你正式报价。\n\n为了核得准，顺手告诉我三件事：1）材质或规格要求；2）数量；3）发到哪个国家/港口。如果方便，把关键页截成图片发我，图片我能直接看、直接评。`;
    return {
      reply,
      understood: true,
      intent: { product: null, quantity: null },
      factoryQa: false,
      manualQuote: true,
      factories: [],
      products: [],
      linkContext: null,
      product: null,
      followUp: null,
    };
  }

  // 外链识别：买家贴了亚马逊/TikTok/独立站等零售链接（1688 链接走 extractOfferId 老链路，不在此列）
  // 与模型清单并行抓取，不阻塞意图抽取之后的链路
  const extUrl = extractExternalUrl(message);

  // 选品意图（"什么好卖/爆款/趋势"）走真实雷达榜，零 LLM 延迟，绝不编数据
  if (!radarCtx && !extUrl && SELECTION_RE.test(message) && !extractOfferId(message)) {
    const radar = await radarSelectionReply(locale);
    if (radar) return radar;
  }

  // 模型清单与外链解析并行——省 2-4s 冷启动
  const [modelsRes, linkRes] = await Promise.allSettled([
    listModels(),
    extUrl ? resolveExternalLink(extUrl) : Promise.resolve(null),
  ]);
  const linkCtx: LinkContext | null = linkRes.status === "fulfilled" ? linkRes.value : null;
  if (linkRes.status === "rejected") {
    log.warn("外链解析异常，按普通对话流程走", { error: linkRes.reason instanceof Error ? linkRes.reason.message : String(linkRes.reason) });
  }

  // 意图抽取：链接读到标题时，把标题一并给解析器（英文品名翻成中文品类词；雷达直达场景意图已钉死，不再调 LLM）
  const intentInput = linkCtx?.title
    ? `【买家贴了${linkCtx.platform}商品链接，页面标题：${linkCtx.title}${linkCtx.priceText ? `，海外售价约 ${linkCtx.priceText}` : ""}】买家原话：${message}`
    : message;
  const defaultModelId = modelsRes.status === "fulfilled" ? modelsRes.value.defaultModelId : process.env.KIMI_AGENTGW_MODEL ?? "kimi-k2-thinking";
  // 意图抽取失败绝不抛 500：降级到本地词库兜底，筛厂/搜货链路照跑
  let imageSpecsNote: string | null = null;
  let imageFailed = false;
  let intent: z.infer<typeof intentSchema>;
  if (radarCtx) {
    intent = { product: radarCtx.keyword, quantity: null, destination: null, budgetNote: null, followUp: null, region: null, isGreeting: false, salutation: null };
  } else if (imageData) {
    // 商品图识别与意图抽取合一：单次调用出品类词+可见规格（网关默认模型支持图片输入）
    try {
      const r = await generateObject({
        model: kimiGw(defaultModelId),
        system:
          INTENT_SYSTEM +
          "\n6. 买家消息附带商品图：product 从图里认（翻成中文品类词，尽量具体到产品）；specsNote 一句话写图上可见的规格/材质/颜色；实在看不出是什么，product 与 specsNote 都给 null。",
        messages: [
          ...llmHistory(history),
          {
            role: "user" as const,
            content: [
              { type: "image" as const, image: imageData },
              { type: "text" as const, text: intentInput },
            ],
          },
        ],
        schema: imageIntentSchema,
        abortSignal: AbortSignal.timeout(12_000),
      });
      intent = r.object;
      imageSpecsNote = r.object.specsNote;
      if (!intent.product) imageFailed = true; // 没认出品类=识别失败，话术里要诚实
    } catch (e) {
      log.warn("图片意图识别失败，走本地词库兜底", { error: e instanceof Error ? e.message : String(e) });
      imageFailed = true;
      intent = localIntentFallback(message.replace(/https?:\/\/\S+/g, " ")); // 数量只在买家原话里找——链接标题里的"50 Pack"是规格不是采购量
    }
  } else {
    try {
      const r = await generateObject({
        model: kimiGw(process.env.KIMI_AGENTGW_MODEL ?? "kimi-k2-thinking"),
        system: INTENT_SYSTEM,
        messages: [
          ...llmHistory(history),
          { role: "user" as const, content: intentInput },
        ],
        schema: intentSchema,
        abortSignal: AbortSignal.timeout(12_000), // 意图抽取 12s 封顶（预览网关超时紧，给后端全链留余量）
      });
      intent = r.object;
    } catch (e) {
      log.warn("意图抽取失败，走本地词库兜底", { error: e instanceof Error ? e.message : String(e) });
      intent = localIntentFallback(message.replace(/https?:\/\/\S+/g, " ")); // 数量只在买家原话里找——链接标题里的"50 Pack"是规格不是采购量
    }
  }

  // 字段级来源标注：不信 LLM 自报，由规则在买家语料里找证据（user/ai/derived/unknown 四态，AI 推断必须亮身份）
  const historyUserText = history.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const intentSources = tagIntentSources(message, historyUserText, intent, { fromImage: !!imageData, fromRadar: !!radarCtx });

  const messages = [
    ...llmHistory(history),
    { role: "user" as const, content: message },
  ];

  // 阶段一·五：用户贴了 1688 链接/货号 → 实时拉取真实商品 + 背后工厂
  // 注意：外部零售链接（extUrl 非空）里的长数字串不是 1688 货号，必须跳过，否则 TikTok 商品 ID 会被拿去查上游
  const offerId = extUrl ? null : extractOfferId(message);
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

  // ---- V105 称谓解析：本条消息刚告知的称呼 > 登录档案 displayName > 前端 localStorage 传来的 hint ----
  // 无状态架构每轮重建 facts，称谓永不遗忘；所有写入/注入一律过 sanitizeSalutation 防呆（罗总口径：只拦明显脏词，不过度拦截）。
  const newSal = sanitizeSalutation(intent.salutation);
  // 抽到了称呼但防呆拦下（脏词/特殊符号）——话术要明确"这个用不了、请换一个"，绝不复述原词、绝不假装记下
  const salRejected = !!intent.salutation && !newSal;
  const storedSal = userId
    ? await getUserSalutation(userId).catch(() => null)
    : sanitizeSalutation(salutationHint);
  const salutation = newSal ?? storedSal;
  // "刚告知"判定要过一道去重：LLM 会从历史里重复抽取同一个称呼（实测抓到）——
  // 与既有称呼相同的抽取不算"刚告知"，否则每轮都"好，王哥，记下了"，正是罗总红线的客服感
  const justGiven = !!newSal && newSal !== storedSal;
  // 登录买家告知了新称呼 → 写回档案（跨会话记住；失败静默不阻塞答话）
  if (newSal && userId && newSal !== storedSal) {
    await updateUserSalutation(userId, newSal).catch((e) => {
      log.warn("称谓写回失败", { error: e instanceof Error ? e.message : String(e) });
    });
  }
  // 方案 B「首轮开口问」：无任何已知称呼 + 本会话第一条用户消息是正经需求（纯问候不重复问——前端开场白已问过）+ 非雷达/图片/链接/货号直达
  const shouldAskSalutation =
    !salutation &&
    !intent.isGreeting &&
    history.filter((m) => m.role === "user").length === 0 &&
    !radarCtx && !imageData && !linkCtx && !offerId;

  // 纯闲聊（且没带链接/商品）：直接回，不查库；LLM 失败时给静态开场白，不报错。
  // intent.salutation 非空也算这类——"叫我王哥"不是采购需求，走问候口径确认称呼
  if ((intent.isGreeting || intent.salutation) && !intent.product && !productInfo && !linkCtx) {
    const salHintZh = salutation
      ? justGiven
        ? `\n称呼：买家在这条消息里刚告诉你，TA 希望被称为「${salutation}」——先自然确认一句（"好，${salutation}，记下了"），再顺势问 TA 想看什么货。`
        : `\n称呼：买家希望被称为「${salutation}」，开场带上一次即可。`
      : salRejected
        ? `\n称呼：买家刚给了一个不能用的称呼（含脏话或特殊符号）——绝不复述原词，也别假装记下了；就礼貌说一句这个称呼用不了、请换一个，然后回正事。`
        : "";
    const salHintEn = salutation
      ? justGiven
        ? `\nForm of address: the buyer just told you in this message they want to be called "${salutation}" — acknowledge it in a few words ("Got it, ${salutation}"), then ask what they're looking to source.`
        : `\nForm of address: the buyer likes to be called "${salutation}" — use it once in your opening.`
      : salRejected
        ? `\nForm of address: the buyer just gave a name we can't use (profanity or invalid characters) — never repeat it, never pretend you saved it; politely say that one won't work and ask for another, then get back to business.`
        : "";
    try {
      const { text } = await generateText({
        model: kimiGw(defaultModelId),
        system: replySystemFor(locale),
        prompt: locale !== "zh"
          ? `User message: ${message}\nSourcing intent: small talk / no clear category\nFactory list: []${salHintEn}`
          : `用户消息：${message}\n采购意图：纯闲聊/无明确品类\n工厂清单：[]${salHintZh}`,
        abortSignal: AbortSignal.timeout(12_000),
      });
      return { reply: text, understood: false, intent, intentSources, factories: [], product: null, followUp: null, salutation };
    } catch (e) {
      log.warn("greeting 话术生成失败，用静态开场白", { error: e instanceof Error ? e.message : String(e) });
      // 静态兜底也带上称呼：刚告知的先确认，已知的开场带一次
      const gf = locale !== "zh" ? GREETING_FALLBACK_EN : GREETING_FALLBACK;
      const prefix = !salutation
        ? ""
        : justGiven
          ? locale !== "zh" ? `Got it, ${salutation}. ` : `好，${salutation}，记下了。`
          : locale !== "zh" ? `${salutation}, ` : `${salutation}，`;
      return { reply: prefix + gf, understood: false, intent, intentSources, factories: [], product: null, followUp: null, salutation };
    }
  }

  // 阶段二：真实匹配（先按 85 分门槛，不足 3 家放宽门槛补齐）
  // 品类词来源：意图抽取优先；用户贴了商品链接时，从真实商品标题/类目兜底
  let keyword = intent.product;
  if (!keyword && productInfo?.offer) {
    const titleHit = expandQuery(productInfo.offer.title);
    if (titleHit.category) keyword = productInfo.offer.title;
  }
  if (!keyword && linkCtx?.title) {
    const titleHit = expandQuery(linkCtx.title);
    if (titleHit.category) keyword = linkCtx.title; // 链接标题命中词库类目 → 用标题搜货
  }
  let factories: Awaited<ReturnType<typeof matchFactories>> = [];
  let relaxed = false;
  // 建材工业试点桶：规格参数复杂，报价转人工核价（自动佣金矩阵不适用于该品类）
  const manualQuote = !!keyword && expandQuery(keyword).category === "建材工业";
  let searchProducts: { offerId: string; title: string; image: string | null; price: number; promotionPrice: number | null; sales: number }[] = [];
  if (keyword) {
    // 工厂匹配与商品搜索并行——两个独立数据源，串行白等 3-5s
    const [fRes, sRes] = await Promise.allSettled([
      (async () => {
        let fs = await matchFactories({ keyword, location: intent.region ?? undefined, limit: 6 });
        let wasRelaxed = false;
        if (fs.length < 3) {
          const more = await matchFactories({ keyword, location: intent.region ?? undefined, minScore: 0, limit: 6 });
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
      searchProducts = sRes.value.items.slice(0, 8).map((p) => ({ ...p, image: proxyImageUrl(p.image) }));
    }
  }

  // 以货带厂（v48）：从产品池全量匹配里找"严选厂在卖的货"（严选厂货排前），三键 join 严选库。
  // 候选取自产品池而非本轮搜索结果——本轮可能命中 30min 缓存（未经严选排序），池子才是全量资产。
  // 命中 = "这家严选厂就在卖这款货"——比名称撞词硬得多的证据，置顶配金标。
  // 10s 封顶（池子与详情缓存命中时毫秒级），超时放弃不阻塞话术。
  if (keyword) {
    try {
      const pooled = await poolSearch(keyword, 20).catch(() => [] as Awaited<ReturnType<typeof poolSearch>>);
      let linked = pooled.length
        ? await Promise.race([
            linkTopOffersToFactories(pooled, 3),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
          ])
        : null;
      // legacy 商品库补位：产品池以货带厂不足 3 家时，用对方 39.6 万资产里 member_id 直挂严选厂的货（零 API 成本）
      if (!linked || linked.length < 3) {
        const legacyLinked = await legacyLinkedFactories(keyword, 3 - (linked?.length ?? 0)).catch(() => [] as Awaited<ReturnType<typeof legacyLinkedFactories>>);
        if (legacyLinked.length) {
          const seenF = new Set((linked ?? []).map((l) => l.factory.id));
          linked = [...(linked ?? []), ...legacyLinked.filter((l) => !seenF.has(l.factory.id))];
        }
      }
      if (linked?.length) {
        // 买家指定产地（region）时，以货带厂只保留该地区的厂——别地区厂即使在售这款货也不插队（买家立场）
        const regionFiltered = intent.region
          ? linked.filter((l) => String(l.factory.location ?? "").includes(intent.region!))
          : linked;
        // V104：配件货不算"这款货"——「智能马桶泡沫泵 ¥9.5」「马桶盖过滤器 ¥2.6」顶着产品词混成
        // productLinked 置顶，话术引用成"这款 ¥9.5 起"是事故。买家真要配件时（wantsAcc）不过滤。
        const accOk = queryWantsAccessory(keyword);
        const cleanLinked = accOk
          ? regionFiltered
          : regionFiltered.filter((l) => !looksLikeAccessory(l.title) && !mentionIsAccessoryCompound(l.title, keyword));
        const byFactory = new Map<number, (typeof linked)[number]>();
        for (const l of cleanLinked) if (!byFactory.has(l.factory.id)) byFactory.set(l.factory.id, l);
        // 已在推荐列表里的厂：升级 matchBasis + 挂在售货快照
        factories = factories.map((f) => {
          const l = byFactory.get(f.id);
          if (!l) return f;
          byFactory.delete(f.id);
          return {
            ...f,
            matchBasis: "productLinked" as const,
            exactProduct: true, // 以货带厂=这款货就在这家厂在售，最硬的"做过这款"证据
            linkedOffer: { offerId: l.offerId, title: l.title, price: l.price, sales: l.sales },
            categoryRank: f.categoryRank, // 保留原排名（若有）
            evidence: [
              `在售这款货：「${l.title.slice(0, 40)}」¥${l.price} 起` + (l.sales > 0 ? ` · 上游销量 ${l.sales.toLocaleString()}（实时核对）` : " · 在册档案货源"),
              ...f.evidence,
            ],
          };
        });
        // 不在列表里的严选厂：补进来（有在售货就是最强相关证据），列表仍封顶 6 家
        for (const l of byFactory.values()) {
          factories.unshift({
            id: l.factory.id,
            name: l.factory.name,
            tier: l.factory.tier,
            score: l.factory.score != null ? Number(l.factory.score) : null,
            years: l.factory.years != null ? Number(l.factory.years) : null,
            location: l.factory.location,
            cert: l.factory.cert,
            repurchaseRate: null,
            mainImage: null,
            productImages: l.image && /^https?:\/\//i.test(l.image) ? [proxyImageUrl(l.image)] : [], // 卡片先让买家看到这款货（URL 走代理，藏源头身份）
            tags: [],
            reason: "严选库在册 · 有这款在售货",
            subScores: null,
            matchBasis: "productLinked" as const,
            exactProduct: true, // 以货带厂=这款货就在这家厂在售
            linkedOffer: { offerId: l.offerId, title: l.title, price: l.price, sales: l.sales },
            categoryRank: null,
            evidence: [`在售这款货：「${l.title.slice(0, 40)}」¥${l.price} 起` + (l.sales > 0 ? ` · 上游销量 ${l.sales.toLocaleString()}（实时核对）` : " · 在册档案货源")],
          });
        }
        // productLinked 置前，其余保持 direct 前 bucket 后的原序；封顶 6 家
        factories = [
          ...factories.filter((f) => f.matchBasis === "productLinked"),
          ...factories.filter((f) => f.matchBasis !== "productLinked"),
        ].slice(0, 6);
      }
    } catch (e) {
      log.warn("以货带厂失败，按原有厂单出", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 品类缺口雷达 → 探源单（P0 2026-11-18）：关键词有效但严选库拿不出"做过这款产品"的厂
  // （判定口径=exactProduct/productLinked：厂名/评语/标签含这款产品词，或有这款在售货源。
  //   注意不用 matchBasis=direct——direct 命中类目兄弟词即算（脐钉→耳环厂），大类有厂 ≠ 核实做过这款。
  //   2026-11-18 实测：脐钉/舌钉/鼻钉全部 4 direct 但 zero exactProduct，旧口径下探源永远不会触发）
  // → 建探源单（sourcing_requests，同步毫秒级）并后台拉候选池。TXGC 拉取仍 fire-and-forget 绝不阻塞答话；
  // 同关键词 24h 去重；关键词经词库清洗（整句不拉上游，防空搜白扣费）。sourcingRequestId 透出给路由补会话链+前端挂步骤条卡。
  const wantsAcc = keyword ? queryWantsAccessory(keyword) : false;
  const hasEvidenceGradeFactory = factories.some((f) => {
    if (f.matchBasis !== "productLinked" && !f.exactProduct) return false;
    // V104：买家问整机词时，配件货不算"做过这款"的证据（马桶→马桶刷货源压住真缺口的教训）
    if (!wantsAcc && f.linkedOffer?.title && looksLikeAccessory(f.linkedOffer.title)) return false;
    return true;
  });
  let sourcingRequestId: number | null = null;
  if (keyword && !hasEvidenceGradeFactory) {
    sourcingRequestId = await recordGap(keyword, locale, userId, {
      // LLM 意图抽出的产品词本身可信：LEXICON 提不出词时直接用它拉上游，不再 no_keyword 白丢缺口
      trustKeyword: keyword === intent.product,
    }).catch((e) => {
      log.warn("缺口记录失败", { error: e instanceof Error ? e.message : String(e) });
      return null;
    });
  }

  // 权益锁（2026-11-07 罗总授权）：未解锁买家的厂名全部换代号。
  // 必须在话术组装前 mask——LLM 上下文、兜底话术模板、前端卡片同一份数据，只此一道闸
  if (!unlocked) {
    factories = factories.map((f) => ({ ...f, name: maskedFactoryName(f.id), masked: true }));
    if (productInfo?.factory) {
      productInfo = { ...productInfo, factory: maskFactory(productInfo.factory, false) };
    }
    if (productInfo?.offer) {
      productInfo = { ...productInfo, offer: maskOffer(productInfo.offer, false)! };
    }
  }

  // 问到即采（P1，2026-11-08）：买家在打听某家具体工厂的底细（人数/规模/成立/验厂/靠不靠谱），
  // 若该厂档案缺关键字段且 24h 内未补查过 → 实时调数据源补查这一家（约 ¥0.10，台账+当日熔断+同厂节流）。
  // 全程 12s 封顶：超时也照常出话术，缺的字段按"我还在核实"口径诚实呈现，绝不编数字。
  let factoryCard: Record<string, unknown> | null = null;
  try {
    const qaTargetId =
      (productInfo?.factory?.id as number | undefined) ??
      (FACTORY_QA_RE.test(message) ? factories[0]?.id : undefined);
    if (qaTargetId && FACTORY_QA_RE.test(message)) {
      const db = await getDb();
      const readCard = async () => {
        const [rows]: any = await db.execute(
          dsql`SELECT id, name, tier, score, years, location, cert, employee_count, area_sqm, oem_mode, production_type, monthly_buyers, deep_inspected FROM factories WHERE id = ${qaTargetId} LIMIT 1`,
        );
        return rows?.[0] ?? null;
      };
      let row = await readCard();
      let liveChecked = false;
      if (row) {
        // 关键字段口径：cert=管理体系认证, employee_count=员工人数, area_sqm=厂房面积, years=诚信通年限（店铺年限，非成立年份）
        const KEY_FIELDS = ["cert", "employee_count", "area_sqm", "years"];
        const FIELD_LABEL: Record<string, string> = { cert: "认证", employee_count: "员工人数", area_sqm: "厂房面积", years: "店铺年限" };
        const miss = () => KEY_FIELDS.filter((k) => row![k] == null || row![k] === 0 || row![k] === "");
        if (miss().length >= 2) {
          const enr = await Promise.race([
            enrichFactoryLive(qaTargetId),
            new Promise<null>((res) => setTimeout(() => res(null), 12_000)),
          ]);
          if (enr?.enriched) {
            liveChecked = true;
            row = await readCard();
          }
        }
        if (row) {
          factoryCard = {
            name: unlocked ? row.name : maskedFactoryName(qaTargetId),
            tier: tierLabel(row.tier, locale),
            score: row.score != null ? Number(row.score) : null,
            storeYears: row.years != null ? Number(row.years) : null, // 诚信通店铺年限
            location: row.location,
            cert: row.cert ?? null,
            employees: row.employee_count ?? null,
            areaSqm: row.area_sqm ?? null,
            oemMode: row.oem_mode ?? null,
            productionType: row.production_type ?? null,
            monthlyBuyers: row.monthly_buyers ?? null,
            deepInspected: row.deep_inspected === 1 ? true : null,
            liveChecked, // true=刚刚现场核实了该厂店铺档案；false=用的既有档案
            missingFields: miss().map((k) => FIELD_LABEL[k] ?? k), // 仍缺的字段（中文标签）——话术按"还在核实"处理，绝不允许编
          };
        }
      }
    }
  } catch (e) {
    log.warn("问到即采失败，按现有档案出话术", { error: e instanceof Error ? e.message : String(e) });
  }

  // 阶段三：基于真实结果写话术
  // 买家画像（买侧上下文资产 v1）：登录买家的历史行为推断，供话术个性化引用；画像条数太少/没有=null，绝不硬提
  const buyerProfile = userId ? await getBuyerProfile(userId).catch(() => null) : null;
  const prices = searchProducts.map((p) => p.promotionPrice ?? p.price).filter((n) => n > 0);

  // 外语版根治中文残留：喂 LLM 的事实先把可显示中文字段换成译文/英文代号（缓存同步替换，缺失后台补）——
  // 否则 LLM 会把中文代号「严选工厂 No.」/品类词/地名/证据原样引用进外语话术（概率性残留的根因）
  if (locale !== "zh") {
    try {
      const { translateFields, lookupCached, translateTexts } = await import("../lib/translate");
      if (factories.length) {
        await translateFields(factories as any[], ["location", "reason", "tags", "evidence"], locale);
        // linkedOffer 在售货标题：缓存同步替换，缺失必须当场补齐（await）——同 radarCtx 模式。
        // fire-and-forget 会让外语买家（尤其新语言缓存冷启动时）在答卡里看到 LLM 引用的中文标题原文（ka 巡检实抓）
        const loTitles = factories.map((f) => (f as any).linkedOffer?.title).filter(Boolean) as string[];
        let loMap: Record<string, string> = {};
        if (loTitles.length) {
          loMap = await lookupCached(loTitles, locale);
          const missing = loTitles.filter((t) => !loMap[t]);
          if (missing.length) {
            const fresh = await translateTexts(missing, locale).catch(() => ({}) as Record<string, string>);
            loMap = { ...loMap, ...fresh };
          }
        }
        for (const f of factories) {
          f.name = (f.name as string).replace(/^严选工厂 No\.(\d+)$/, "Vetted Factory No.$1");
          // tier 保持枚举原值（金标/银标…）——卡片由前端 t(`home.tierName.${tier}`) 自译；
          // v80 曾在此预译成英文，导致前端拼出 home.tierName.Gold 死键（2026-11-18 截图实抓）
          const lo = (f as any).linkedOffer;
          if (lo?.title && loMap[lo.title]) lo.title = loMap[lo.title];
        }
      }
      if (intent.product) {
        const pm = await lookupCached([intent.product], locale);
        if (pm[intent.product]) intent = { ...intent, product: pm[intent.product] };
      }
    } catch { /* 预处理失败静默——缓存冷时由巡检预热补齐，下一轮即全译文 */ }
  }

  const facts = JSON.stringify({
    intent,
    buyerSalutation: salutation, // V105：买家希望被如何称呼（已过防呆清洗）；null=未知
    buyerSalutationJustGiven: justGiven, // 本条消息刚告知新称呼（与既有称呼去重后）——先确认一句再回正事（规则 23/25）
    buyerSalutationRejected: salRejected, // 本条给的称呼被防呆拦下——不复述原词、不假装记下，礼貌请 TA 换一个
    shouldAskSalutation, // true=首轮可在答完正事后轻问一次称呼（方案 B，只此一次）
    manualQuoteCategory: manualQuote,
    buyerProfile: buyerProfile && buyerProfile.sampleSize >= 3
      ? {
          categories: buyerProfile.categories.map((c) => c.v),
          destinations: buyerProfile.destinations.map((d) => d.v),
          quantities: buyerProfile.quantities.slice(0, 3),
          sampleSize: buyerProfile.sampleSize,
        }
      : null,
    radarContext: radarCtx
      ? {
          title: radarCtx.title,
          titleEn: radarCtx.titleEn,
          signalText: radarCtx.signalText,
          signalDate: radarCtx.signalDate,
          retailPriceUsd: radarCtx.retailPriceUsd,
          factoryPriceMin: radarCtx.factoryPriceMin,
          factoryPriceMax: radarCtx.factoryPriceMax,
          upstreamCount: radarCtx.upstreamCount,
          vettedCount: radarCtx.vettedCount,
        }
      : null,
    factoryCount: factories.length,
    relaxedThreshold: relaxed,
    linkContext: linkCtx
      ? {
          platform: linkCtx.platform,
          title: linkCtx.title,
          priceText: linkCtx.priceText,
          source: linkCtx.source,
          fetchFailed: linkCtx.fetchFailed ?? false,
        }
      : null,
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
                tier: tierLabel(productInfo.factory.tier, locale),
                score: productInfo.factory.score,
              }
            : null,
        }
      : productFetchFailed
        ? { fetchFailed: true }
        : null,
    imageContext: imageData ? { specsNote: imageSpecsNote, failed: imageFailed } : null,
    factoryCard, // 买家在打听某家具体工厂时：该厂档案卡（缺字段见 missingFields，liveChecked=刚现场核实过）
    factories: factories.map((f) => ({
      name: f.name,
      tier: tierLabel(f.tier, locale), // 枚举值不过 LLM：中文「优选/金标」裸喂会被原样引用进外语回复（v80/v104 巡检实抓）
      score: f.score,
      years: f.years,
      location: f.location,
      reason: f.reason,
      matchBasis: f.matchBasis, // productLinked=严选库在册且有这款在售货（最硬）；direct=有做这类产品的直接证据；bucket=仅大类高分厂
      linkedOffer: f.linkedOffer, // productLinked 时的在售货快照（标题/价格/销量，均已实时核对）
      categoryRank: f.categoryRank,
      evidence: f.evidence,
    })),
  });
  // 阶段三：基于真实结果写话术（18s 封顶；超时/失败 → 规则模板兜底，绝不让买家白等报错）
  let reply: string;
  try {
    const r = await generateText({
      model: kimiGw(defaultModelId),
      system: replySystemFor(locale),
      messages: [
        ...messages,
        { role: "user" as const, content: locale !== "zh"
          ? `[System facts] ${facts}\nReply to the user based on these facts.`
          : `[系统事实] ${facts}\n请基于以上事实回复用户。` },
      ],
      abortSignal: AbortSignal.timeout(25_000), // 11-19 授权：网关偏慢，reply 18s→25s 减少兜底触发
    });
    reply = r.text;
  } catch (e) {
    log.warn("reply 话术生成失败，走规则模板兜底", { error: e instanceof Error ? e.message : String(e) });
    // 兜底模板直接把 intent.product 嵌进话术：外语版先查翻译缓存换成显示词（未命中=留原词，巡检预热后必命中）
    let dispIntent = intent;
    if (locale !== "zh" && intent.product) {
      try {
        const { lookupCached } = await import("../lib/translate");
        const pm = await lookupCached([intent.product], locale);
        if (pm[intent.product]) dispIntent = { ...intent, product: pm[intent.product] };
      } catch { /* 查缓存失败静默回落原词 */ }
    }
    reply = locale !== "zh"
      ? buildFallbackReplyEn(dispIntent, factories, searchProducts, relaxed, radarCtx, linkCtx, imageData ? { specsNote: imageSpecsNote, failed: imageFailed } : null, salutation, justGiven, shouldAskSalutation)
      : buildFallbackReply(intent, factories, searchProducts, relaxed, radarCtx, linkCtx, imageData ? { specsNote: imageSpecsNote, failed: imageFailed } : null, salutation, justGiven, shouldAskSalutation);
    // 建材工业桶：兜底话术是模板，不经过 LLM 规则——人工核价口径在这里确定性补上
    if (manualQuote) {
      reply += locale !== "zh"
        ? "\n\nOne more thing — specs move the price a lot in this category, so I won't throw you an estimate: our sourcing team will price it manually against your specs or drawings, with a firm quote within 48 hours."
        : "\n\n另外说一句：这类品规格差一点价格差很多，我不给你甩估算数字——让采购团队按你的规格或图纸人工核价，48 小时内出正式报价。";
    }
  }

  // 补充问题卡：规则驱动（非阻塞——结果照出，卡附在下面；答过/跳过就不再问）
  const followUp = buildFollowUpCard(intent, message, history, locale);

  // 商品数据层翻译：locale≠zh 时批量翻标题+类目路径（缓存终身有效；失败/超时回落原文，绝不阻塞回复）。
  // 覆盖商品墙 searchProducts 与雷达/链接直达的单品卡 productInfo.offer——同一批一次调用，不多花时间。
  if (locale !== "zh" && (searchProducts.length || productInfo?.offer || factories.length)) {
    const { translateTexts } = await import("../lib/translate");
    const texts: string[] = [];
    for (const p of searchProducts) texts.push(p.title);
    if (productInfo?.offer) texts.push(productInfo.offer.title, productInfo.offer.categoryName ?? "");
    // 工厂卡可显示中文字段：地名/拿货理由/标签/证据行/在售同款标题/排名类目名（代号「严选工厂 No.」由前端 i18n 处理，不走 LLM）
    for (const f of factories) {
      texts.push(f.location ?? "", f.reason ?? "", ...(f.tags ?? []).slice(0, 4), ...(f.evidence ?? []), f.categoryRank?.category ?? "");
      const lo = (f as any).linkedOffer;
      if (lo?.title) texts.push(lo.title);
    }
    if (intent.product) texts.push(intent.product); // 意图卡产品词（radarCtx.keyword 等中文）
    const map = await translateTexts(texts.filter(Boolean), locale);
    for (const p of searchProducts) if (map[p.title]) p.title = map[p.title];
    if (productInfo?.offer) {
      const o = productInfo.offer;
      if (map[o.title]) o.title = map[o.title];
      if (o.categoryName && map[o.categoryName]) o.categoryName = map[o.categoryName];
    }
    for (const f of factories) {
      if (f.location && map[f.location]) f.location = map[f.location];
      if (f.reason && map[f.reason]) f.reason = map[f.reason];
      if (f.tags?.length) f.tags = f.tags.map((tg) => map[tg] ?? tg);
      if (f.evidence?.length) f.evidence = f.evidence.map((ev) => map[ev] ?? ev);
      if (f.categoryRank && map[f.categoryRank.category]) f.categoryRank.category = map[f.categoryRank.category];
      const lo = (f as any).linkedOffer;
      if (lo?.title && map[lo.title]) lo.title = map[lo.title];
    }
    // 意图卡的产品词（radarCtx.keyword 等中文）一并翻，否则英文界面出"Item 穿戴甲"
    if (intent.product && map[intent.product]) intent.product = map[intent.product];
  }

  return {
    reply,
    understood: factories.length > 0 || !!productInfo || searchProducts.length > 0,
    intent: { product: intent.product, quantity: intent.quantity, destination: intent.destination, region: intent.region, budgetNote: intent.budgetNote },
    intentSources, // 字段级来源标注（四态）——前端逐字段亮明"你说的/AI推断"
    factoryQa: !!factoryCard, // 供推荐证据链落库标记"本轮触发了问到即采"
    manualQuote, // 建材工业桶：前端据此把费率估算行换成"人工核价"提示
    sourcingRequestId, // 探源单 id（无缺口触发时为 null）；前端挂步骤条卡、路由补会话链
    factories,
    // V111 推荐收敛 1+2：factories[0]=主推（已按 productLinked 优先+评分排序），[1,2]=备选，[3+]=「全库再筛」逃生口。
    // 主推标注显式下发：前端大卡推荐理由 chips 与 QA 断言用，口径单一事实源在后端。
    topPick: factories.length
      ? {
          id: factories[0].id,
          linked: factories[0].matchBasis === "productLinked", // 最硬证据=严选厂在卖这款
          exactProduct: !!factories[0].exactProduct,
          tier: tierLabel(factories[0].tier, locale), // 档位定性，不抛分数（CO-001 口径）
          years: factories[0].years,
          location: factories[0].location,
        }
      : null,
    products: searchProducts,
    linkContext: linkCtx
      ? { platform: linkCtx.platform, title: linkCtx.title, image: proxyImageUrl(linkCtx.image), priceText: linkCtx.priceText, url: linkCtx.url, source: linkCtx.source, fetchFailed: linkCtx.fetchFailed ?? false }
      : null,
    product: productInfo
      ? { offer: productInfo.offer, factory: productInfo.factory }
      : null,
    followUp,
    salutation, // V105：当前生效称谓（null=未知）；前端据此写 localStorage 闭环
  };
}

// 最外层保险：任何漏网异常都不让买家看到报错——返回诚实的降级话术（HTTP 200），并留日志可查
export async function sourcingChat(message: string, history: ChatMsg[], radarId?: number, imageData?: string, locale: string = "zh", unlocked = false, userId: number | null = null, salutationHint: string | null = null) {
  try {
    return await sourcingChatInner(message, history, radarId, imageData, locale, unlocked, userId, salutationHint);
  } catch (e) {
    log.error("ai.chat 未捕获异常，走全兜底", { error: e instanceof Error ? e.message : String(e) });
    return {
      reply:
        locale !== "zh"
          ? "My system hiccuped — not your fault, my upstream interface threw a tantrum. I've noted your message; resend it in a moment. In a hurry? Browse the vetted factory library and send me whatever catches your eye — I'll dig into it."
          : "我这边系统卡了一下——不是你的问题，是我这头的接口闹脾气。你的话我记住了，稍等片刻再发一次就行；急着看货就先去「严选工厂库」自己逛，看中的发我，我接着帮你查底细。",
      understood: false,
      intent: { product: null, quantity: null },
      intentSources: null, // 全兜底出口：无可信意图，前端不渲染来源行
      factories: [],
      products: [],
      product: null,
      followUp: null,
      salutation: null, // 全兜底拿不到解析结果——前端保留本地已有称谓即可（null=不更新）
    };
  }
}
