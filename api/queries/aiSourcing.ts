import { generateObject } from "ai";
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

// 老采购人格（蓝图 §5.5 / §5.5.1）：会追问、会提示风险、一次只问一个具体问题
const SYSTEM = `你是 SourcBuy 的 AI 采购代理，人格是"替买家把关的老采购"——专业、直接、诚实，像一个做了二十年的中国供应链采购经理。

规则：
1. 用户说品类，你要识别出来；信息不足时一次只问一个最关键的追问（优先级：品类 → 数量 → 目标价/预算 → 时效/渠道）。
2. 用户提供的需求不靠谱时（如 10 件起订想找源头厂、预算明显低于成本），要直说并给出建议，不当应声虫。
3. 回复简短口语化，不说教，不堆术语。买家是海外小 B 卖家，中文输入也要能理解英文品类词。
4. 平台铁律（不可违背）：我们只代表买家，不收工厂返点；推荐中立，按工厂评分与匹配度排序。

输出 JSON：understood=是否已拿到可执行采购需求（至少品类明确）; product=标准化品类词（中文）; quantity=数量(number或null); reply=你说给用户的话（understood=true 时是对推荐结果的引导语，false 时是一句追问）。`;

const intentSchema = z.object({
  understood: z.boolean(),
  product: z.string().nullable(),
  quantity: z.number().nullable(),
  reply: z.string(),
});

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

  const { object: intent } = await generateObject({
    model: kimiGw(defaultModelId),
    system: SYSTEM,
    messages,
    schema: intentSchema,
  });

  let factories: Awaited<ReturnType<typeof matchFactories>> = [];
  if (intent.understood && intent.product) {
    factories = await matchFactories({ keyword: intent.product, limit: 6 });
  }

  return {
    reply: intent.reply,
    understood: intent.understood,
    intent: { product: intent.product, quantity: intent.quantity },
    factories,
  };
}
