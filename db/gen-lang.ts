// 界面语言包生成器：zh.ts → es/fr/pt。LLM 批量翻译，键集与 {占位符} 强校验，缺口回落 en 并报 warn。
// 用法：npx tsx db/gen-lang.ts es fr pt
process.loadEnvFile();
import { generateObject } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import fs from "fs";
import { zh } from "../src/i18n/zh";
import { en } from "../src/i18n/en";

const kimiGw = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL!,
  apiKey: process.env.KIMI_AGENTGW_API_KEY!,
  supportsStructuredOutputs: true,
});

const LANG_NAME: Record<string, string> = { es: "Spanish (es)", fr: "French (fr)", pt: "Portuguese (pt)" };

// 拍平：所有叶子都收成 path → string（数组/对象递归到字符串叶子）
function flatten(obj: any, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[p] = v;
    else if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === "string") out[`${p}.${i}`] = x; else Object.assign(out, flatten(x, `${p}.${i}`)); });
    else if (v && typeof v === "object") Object.assign(out, flatten(v, p));
  }
  return out;
}

function unflatten(flat: Record<string, string>): any {
  const root: any = {};
  for (const [path, val] of Object.entries(flat)) {
    const parts = path.split(".");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      const nextIsIdx = /^\d+$/.test(parts[i + 1]);
      if (cur[k] == null) cur[k] = nextIsIdx ? [] : {};
      cur = cur[k];
    }
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) {
      if (!Array.isArray(cur)) continue;
      cur[Number(last)] = val;
    } else cur[last] = val;
  }
  return root;
}

const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");

const batchSchema = z.object({ items: z.array(z.string()) });

async function translateBatch(texts: string[], langName: string): Promise<string[]> {
  const r = await generateObject({
    model: kimiGw("k2d8-preview"), // 翻译是轻量任务，不用 thinking 模型（快 5-10 倍）
    system: `You are translating UI copy for SourcBuy, a sourcing-agent platform that serves overseas small-B buyers purchasing from China. Tone: professional, direct, honest veteran buyer. Translate the following Chinese UI strings into natural ${langName}.
Hard rules: keep placeholders like {n} {rate} {tier} exactly as-is, untranslated and in place; keep brand names (SourcBuy), URLs and numbers as-is; translate meaning not word-by-word; keep it concise — these are UI labels and chat copy. Output exactly the same number of strings, same order. No explanations.`,
    messages: [{ role: "user", content: JSON.stringify(texts) }],
    schema: batchSchema,
    abortSignal: AbortSignal.timeout(150_000),
  });
  return r.object.items;
}

const flatZh = flatten(zh);
const flatEn = flatten(en);
const keys = Object.keys(flatZh);
console.log(`zh 键数（拍平到叶子）: ${keys.length}`);

for (const lang of process.argv.slice(2)) {
  const langName = LANG_NAME[lang];
  if (!langName) { console.log(`跳过未知语言 ${lang}`); continue; }
  const out: Record<string, string> = {};
  let warnCount = 0;
  const BATCH = 80;
  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH);
    const texts = slice.map((k) => flatZh[k]);
    let items: string[] = [];
    try {
      items = await translateBatch(texts, langName);
    } catch (e) {
      console.log(`  [${lang}] 批次 ${i} 失败，回落 en:`, e instanceof Error ? e.message.slice(0, 80) : e);
    }
    slice.forEach((k, j) => {
      let tr = items[j]?.trim();
      if (!tr || placeholders(tr) !== placeholders(flatZh[k])) {
        if (tr) { warnCount++; console.log(`  [${lang}] 占位符不符 ${k}: ${placeholders(flatZh[k])} → ${placeholders(tr)}`); }
        tr = flatEn[k] ?? flatZh[k]; // 回落英文（比中文更接近买家）
        if (!flatEn[k]) warnCount++;
      }
      out[k] = tr;
    });
    console.log(`  [${lang}] ${Math.min(i + BATCH, keys.length)}/${keys.length}`);
  }
  const nested = unflatten(out);
  const body = JSON.stringify(nested, null, 2).replace(/"([^"]+)":/g, "$1:");
  fs.writeFileSync(`src/i18n/${lang}.ts`, `// 机器翻译生成（LLM 批量），占位符已校验；润色请直接改本文件\nexport const ${lang} = ${body};\n`);
  console.log(`[${lang}] 完成，${Object.keys(out).length} 键，${warnCount} 处回落/告警\n`);
}
