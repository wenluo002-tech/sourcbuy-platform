import { generateObject, generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
const kimiGw = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL!,
  apiKey: process.env.KIMI_AGENTGW_API_KEY!,
  supportsStructuredOutputs: true,
});
const samples = Array.from({ length: 20 }, (_, i) => `E0${(i % 9) + 1}浮生若梦 · 袋装【${["M", "S", "XS"][i % 3]}】无工具包`);

// A) generateObject 结构化
let t0 = Date.now();
try {
  const r = await generateObject({
    model: kimiGw("k2d8-preview"),
    system: "Translate each Chinese SKU spec string into concise buyer-facing English. Keep model codes (E01 etc.), sizes, units as-is. Output exactly N strings in the same order.",
    messages: [{ role: "user", content: JSON.stringify(samples) }],
    schema: z.object({ translations: z.array(z.string()) }),
    abortSignal: AbortSignal.timeout(90_000),
  });
  console.log(`generateObject: ${Date.now() - t0}ms, n=${r.object.translations.length}, 样例=${r.object.translations[0]}`);
} catch (e) { console.log(`generateObject 失败: ${Date.now() - t0}ms`, e instanceof Error ? e.message : e); }

// B) generateText 裸文本
t0 = Date.now();
try {
  const r = await generateText({
    model: kimiGw("k2d8-preview"),
    system: "Translate each Chinese SKU spec string into concise buyer-facing English. Keep model codes (E01 etc.), sizes, units as-is. Output a JSON array of exactly N strings in the same order. No explanations.",
    messages: [{ role: "user", content: JSON.stringify(samples) }],
    abortSignal: AbortSignal.timeout(90_000),
  });
  console.log(`generateText: ${Date.now() - t0}ms, 输出前120字=${r.text.slice(0, 120)}`);
} catch (e) { console.log(`generateText 失败: ${Date.now() - t0}ms`, e instanceof Error ? e.message : e); }
process.exit(0);
