import { generateObject, generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { listModels } from "../lib/ai-client";
import { matchFactories } from "./factories";

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
1. 工厂卡片会由界面展示在你的话下面（含评分、分层、推荐证据），你不要逐家罗列工厂名，只做点评、给建议、提示风险（一两句点到即可，引用真实数据，如"它在该类目 484 家里排第 3"）。
2. 清单为空时必须诚实说明"这个品类词库里暂时没匹配到合适的工厂"，并给 1-2 个替代建议（换个更通用的品类词 / 放宽条件 / 留需求给人工买手）。绝不允许声称"已筛出/下面是对比"等没有发生的事。
3. 需求不靠谱要直说：预算明显低于成本要劝，起订量太小别推源头大厂。不当应声虫。
4. 还差关键信息（数量/目标价）时，在话尾补一个追问，一次只问一个。
5. 回复简短口语化，不说教，不堆术语。买家是海外小 B 卖家。
6. 纯文本输出：不要用任何 Markdown 语法（不用 ** 加粗、不用 # 标题、不用 - 列表符），换行分段即可。
7. 不要暴露内部术语（如 relaxedThreshold）；如果系统放宽了评分门槛，用"我把评分门槛放宽了些"这样的口语表达。
6. 平台铁律：只代表买家，不收工厂返点；推荐按评分中立排序，评分算法公开（七维加权），工厂不可付费影响排名。`;

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export async function sourcingChat(message: string, history: ChatMsg[]) {
  const { defaultModelId } = await listModels();
  const messages = [
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content }) as const),
    { role: "user" as const, content: message },
  ];

  // 阶段一：抽意图
  const { object: intent } = await generateObject({
    model: kimiGw(defaultModelId),
    system: INTENT_SYSTEM,
    messages,
    schema: intentSchema,
  });

  // 纯闲聊：直接回，不查库
  if (intent.isGreeting && !intent.product) {
    const { text } = await generateText({
      model: kimiGw(defaultModelId),
      system: REPLY_SYSTEM,
      prompt: `用户消息：${message}\n采购意图：纯闲聊/无明确品类\n工厂清单：[]`,
    });
    return { reply: text, understood: false, intent, factories: [] };
  }

  // 阶段二：真实匹配（先按 85 分门槛，不足 3 家放宽门槛补齐）
  let factories: Awaited<ReturnType<typeof matchFactories>> = [];
  let relaxed = false;
  if (intent.product) {
    factories = await matchFactories({ keyword: intent.product, limit: 6 });
    if (factories.length < 3) {
      const more = await matchFactories({
        keyword: intent.product,
        minScore: 0,
        limit: 6,
      });
      if (more.length > factories.length) {
        factories = more;
        relaxed = true;
      }
    }
  }

  // 阶段三：基于真实结果写话术
  const facts = JSON.stringify({
    intent,
    factoryCount: factories.length,
    relaxedThreshold: relaxed,
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
  const { text: reply } = await generateText({
    model: kimiGw(defaultModelId),
    system: REPLY_SYSTEM,
    messages: [
      ...messages,
      { role: "user" as const, content: `[系统事实] ${facts}\n请基于以上事实回复用户。` },
    ],
  });

  return {
    reply,
    understood: factories.length > 0,
    intent: { product: intent.product, quantity: intent.quantity },
    factories,
  };
}
