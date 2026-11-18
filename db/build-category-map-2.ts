// 词→类目导航图 · 阶段二：AI 批量映射（只读库，写 /tmp/catmap-final.json）
// 每词从阶段一候选里选 1-3 个「买家搜该词时真正想看的类目」；拿不准返回空数组（=不圈定，回落现行行为）
import fs from "fs";
import { generateObject } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { listModels } from "../api/lib/ai-client";

const stage1 = JSON.parse(fs.readFileSync("/tmp/catmap-stage1.json", "utf8"));
const words: string[] = stage1.words;
const meta: Record<string, { bucket: string | null; candidates: string[] }> = stage1.result;

const kimiGw = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL!,
  apiKey: process.env.KIMI_AGENTGW_API_KEY!,
  supportsStructuredOutputs: true,
});
const models = await listModels();
const modelId = models.defaultModelId;
console.error("模型:", modelId);

const schema = z.object({
  mappings: z.array(z.object({
    word: z.string(),
    categories: z.array(z.string()).max(3),
  })),
});

const SYS = `你是 B2B 采购平台的类目映射专家。任务：给定产品词与候选类目列表，选出买家搜索该产品词时【真正想看到的商品】所属的类目。

铁律：
1. 只能从上给的候选类目中原样选取，1-3 个，不许编造新类目名
2. 多义词按跨境中小买家最常见的采购意图理解（如"钳子"=五金工具钳，不是美甲钳；"中国结"=中国结挂饰本身，不是带中国结图案的衣服）
3. 拿不准、候选里没有真正对题的 → categories 返回空数组（宁缺毋滥，空=不干预搜索）
4. 候选类目名可能是"AA、BB"组合类目，只要组合里有一个对题即可选`;

const BATCH = 10;
const finalMap: Record<string, string[]> = fs.existsSync("/tmp/catmap-final.json")
  ? JSON.parse(fs.readFileSync("/tmp/catmap-final.json", "utf8"))
  : {};
let done = 0, failed = 0;

function save() { fs.writeFileSync("/tmp/catmap-final.json", JSON.stringify(finalMap)); }

async function runBatch(batch: string[]): Promise<void> {
  const payload = batch.map((w) => ({ word: w, bucket: meta[w].bucket, candidates: meta[w].candidates }));
  try {
    const { object } = await generateObject({
      model: kimiGw(modelId),
      schema,
      system: SYS,
      prompt: "请为以下产品词选择期许类目：\n" + JSON.stringify(payload, null, 0),
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(120_000),
    });
    for (const m of object.mappings) {
      const valid = m.categories.filter((c) => meta[m.word]?.candidates.includes(c));
      finalMap[m.word] = valid;
    }
    done += batch.length;
  } catch (e) {
    failed += batch.length;
    for (const w of batch) finalMap[w] = []; // 失败=不圈定，保底
    console.error("批次失败:", e instanceof Error ? e.message.slice(0, 120) : e);
  }
}

const batches: string[][] = [];
const todo = words.filter((w) => !(w in finalMap) || (process.env.REDO_EMPTY === "1" && finalMap[w].length === 0));
console.error(`待处理 ${todo.length} 词（跳过已映射 ${words.length - todo.length}）`);
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
for (let i = 0; i < batches.length; i += 3) {
  await Promise.all(batches.slice(i, i + 3).map(runBatch));
  save();
  if (i % 30 === 0) console.error(`进度 ${Math.min(i + 30, batches.length)}/${batches.length}`);
}
save();
const covered = Object.values(finalMap).filter((v) => v.length > 0).length;
console.error(`完成: 新增 ${done} 词, 失败 ${failed}, 有映射 ${covered}, 不圈定 ${words.length - covered}`);
console.error("STAGE2_DONE");
