// 二轮补翻：ka.ts 中与 en 相同的叶子（首轮超时/校验失败回落项）小批次重翻后 patch 回 ka.ts
process.loadEnvFile();
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import fs from "node:fs";
import { en } from "../src/i18n/en";
import { ka } from "../src/i18n/ka";

const kimiGw = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL!,
  apiKey: process.env.KIMI_AGENTGW_API_KEY!,
});

type Leaf = { path: string[]; value: string };
function collect(node: any, path: string[], out: Leaf[]) {
  if (typeof node === "string") out.push({ path, value: node });
  else if (Array.isArray(node)) node.forEach((v, i) => collect(v, [...path, String(i)], out));
  else if (node && typeof node === "object") for (const k of Object.keys(node)) collect(node[k], [...path, k], out);
}
const enLeaves: Leaf[] = [], kaLeaves: Leaf[] = [];
collect(en, [], enLeaves); collect(ka, [], kaLeaves);

// 回落项 = ka 与 en 完全相同且含拉丁字母（排除 URL/数字/纯符号）
const LATIN = /[A-Za-z]{3,}/;
const todo = enLeaves.filter((l, i) => kaLeaves[i] && kaLeaves[i].value === l.value && LATIN.test(l.value) && !/^https?:/.test(l.value));
console.log(`待补翻=${todo.length}`);

const PH_RE = /\{(\w+)\}/g;
const protect = (s: string) => { const phs: string[] = []; return { text: s.replace(PH_RE, (m) => { phs.push(m); return `⟦${phs.length - 1}⟧`; }), phs }; };
const restore = (s: string, phs: string[]) => { for (let i = 0; i < phs.length; i++) { if (!s.includes(`⟦${i}⟧`)) return null; s = s.replace(`⟦${i}⟧`, phs[i]); } return s; };
const CJK_RE = /[一-鿿　-〿＀-￯]/;

let fixed = 0;
const BATCH = 8;
for (let i = 0; i < todo.length; i += BATCH) {
  const chunk = todo.slice(i, i + BATCH);
  const prepared = chunk.map((l) => protect(l.value));
  try {
    const r = await generateText({
      model: kimiGw("k2d8-preview"),
      system: `You are a professional localization translator for a cross-border B2B sourcing platform. Translate UI strings from English into Georgian (ქართული). Output a JSON array of exactly ${prepared.length} strings, same order. Keep brand names (SourcBuy), URLs and symbols ⟦0⟧ ⟦1⟧ etc. exactly as-is. Natural concise buyer-facing Georgian. ZERO Chinese characters. No explanations, no markdown fences.`,
      messages: [{ role: "user", content: JSON.stringify(prepared.map((p) => p.text)) }],
      abortSignal: AbortSignal.timeout(90_000),
    });
    const m = r.text.match(/\[[\s\S]*\]/);
    const arr: string[] = m ? JSON.parse(m[0]) : [];
    if (arr.length === chunk.length) {
      for (let j = 0; j < chunk.length; j++) {
        const v = restore(String(arr[j] ?? "").trim(), prepared[j].phs);
        if (v && !CJK_RE.test(v) && v !== chunk[j].value) {
          let cur: any = ka;
          for (let k = 0; k < chunk[j].path.length - 1; k++) cur = cur[chunk[j].path[k]];
          cur[chunk[j].path[chunk[j].path.length - 1]] = v;
          fixed++;
        }
      }
    } else console.log(`批错位 want=${chunk.length} got=${arr.length}`);
  } catch (e) { console.log(`批异常: ${e instanceof Error ? e.message : e}`); }
  if ((i / BATCH) % 5 === 0) console.log(`补翻进度 ${i}/${todo.length} 已修=${fixed}`);
}
fs.writeFileSync("src/i18n/ka.ts", `// 格鲁吉亚语字典（程序生成自 en.ts；二轮补翻修复 ${fixed} 条）\nexport const ka = ${JSON.stringify(ka, null, 2)};\n`);
console.log(`FIX_DONE fixed=${fixed}/${todo.length}`);
process.exit(0);
