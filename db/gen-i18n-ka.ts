// 生成 src/i18n/ka.ts：以 en 字典为源，LLM 批量翻译叶子字符串为格鲁吉亚语。
// 结构安全：键集/嵌套形状程序重建自 en（绝不手敲），QA [3d] 再与 zh 对键。
// 占位符 {var} → ⟦n⟧ 哨兵保护，翻后还原+校验，不一致回落英文原文。
// 用法：npx tsx db/gen-i18n-ka.ts          (dry-run 只收集不落盘)
//       npx tsx db/gen-i18n-ka.ts --execute (真翻译并写文件)
process.loadEnvFile();
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import fs from "node:fs";
import { en } from "../src/i18n/en";
import { zh } from "../src/i18n/zh";

const EXECUTE = process.argv.includes("--execute");
const kimiGw = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL!,
  apiKey: process.env.KIMI_AGENTGW_API_KEY!,
});

// ── 1. 收集叶子 ──────────────────────────────────────────
type Leaf = { path: string[]; value: string };
const leaves: Leaf[] = [];
(function walk(node: any, path: string[]) {
  if (typeof node === "string") leaves.push({ path, value: node });
  else if (Array.isArray(node)) node.forEach((v, i) => walk(v, [...path, String(i)]));
  else if (node && typeof node === "object") for (const k of Object.keys(node)) walk(node[k], [...path, k]);
})(en, []);
console.log(`叶子总数=${leaves.length}`);

// ── 占位符哨兵 ──────────────────────────────────────────
const PH_RE = /\{(\w+)\}/g;
function protect(s: string): { text: string; phs: string[] } {
  const phs: string[] = [];
  const text = s.replace(PH_RE, (m) => { phs.push(m); return `⟦${phs.length - 1}⟧`; });
  return { text, phs };
}
function restore(s: string, phs: string[]): string | null {
  for (let i = 0; i < phs.length; i++) {
    if (!s.includes(`⟦${i}⟧`)) return null; // 哨兵丢失 → 判失败
    s = s.replace(`⟦${i}⟧`, phs[i]);
  }
  return s;
}

// ── 2. 键集预检：en 与 zh 同键（以 zh 为 QA 基准）─────────
function keyset(o: any, p = ""): Set<string> {
  const out = new Set<string>();
  for (const k of Object.keys(o ?? {})) {
    const kp = p ? `${p}.${k}` : k;
    out.add(kp);
    if (typeof o[k] === "object" && o[k] !== null) for (const x of keyset(o[k], kp)) out.add(x);
  }
  return out;
}
const zen = keyset(en), zzh = keyset(zh);
const onlyEn = [...zen].filter((k) => !zzh.has(k));
const onlyZh = [...zzh].filter((k) => !zen.has(k));
console.log(`键集对比 en vs zh：en多${onlyEn.length} zh多${onlyZh.length}`, onlyEn.slice(0, 3), onlyZh.slice(0, 3));

// ── 3. 翻译 ──────────────────────────────────────────
const CJK_RE = /[一-鿿　-〿＀-￯]/;
const results = new Map<string, string>(); // path.join(".") → 格鲁吉亚语
let fail = 0;

async function translateBatch(chunk: Leaf[]): Promise<void> {
  const prepared = chunk.map((l) => protect(l.value));
  const payload = prepared.map((p) => p.text);
  const r = await generateText({
    model: kimiGw("k2d8-preview"),
    system: `You are a professional localization translator for a cross-border B2B sourcing platform (SourcBuy). Translate UI strings from English into Georgian (ქართული).
Rules:
- Output a JSON array of exactly ${payload.length} strings, same order, one per input. No explanations, no markdown fences.
- Natural, concise, buyer-facing Georgian as used on professional e-commerce sites. This is a B2B procurement assistant for overseas SME buyers.
- Keep brand names (SourcBuy), URLs, and the symbols ⟦0⟧ ⟦1⟧ etc. EXACTLY as-is — they are placeholders, never translate or reorder them.
- Keep tone: a seasoned procurement veteran who speaks plainly and honestly (may advise against bad deals).
- Output must contain ZERO Chinese characters.`,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    abortSignal: AbortSignal.timeout(60_000),
  });
  let arr: string[] = [];
  try {
    const m = r.text.match(/\[[\s\S]*\]/);
    arr = m ? JSON.parse(m[0]) : [];
  } catch { arr = []; }
  if (arr.length !== chunk.length) {
    console.log(`批错位 want=${chunk.length} got=${arr.length} → 整批回落英文`);
    fail += chunk.length;
    for (const l of chunk) results.set(l.path.join("."), l.value);
    return;
  }
  for (let i = 0; i < chunk.length; i++) {
    const l = chunk[i];
    const restored = restore(String(arr[i] ?? "").trim(), prepared[i].phs);
    if (!restored || CJK_RE.test(restored) || !restored) {
      fail++;
      results.set(l.path.join("."), l.value); // 回落英文
      console.log(`哨兵/中文校验失败回落: ${l.path.join(".")}`);
    } else {
      results.set(l.path.join("."), restored);
    }
  }
}

const BATCH = 15, CONC = 2;
const chunks: Leaf[][] = [];
for (let i = 0; i < leaves.length; i += BATCH) chunks.push(leaves.slice(i, i + BATCH));
if (EXECUTE) {
  let cursor = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (cursor < chunks.length) {
      const c = chunks[cursor++];
      try { await translateBatch(c); } catch (e) {
        console.log(`批异常回落: ${e instanceof Error ? e.message : e}`);
        fail += c.length;
        for (const l of c) results.set(l.path.join("."), l.value);
      }
      done += c.length;
      if (done % 90 < BATCH) console.log(`进度 ${done}/${leaves.length} 失败回落=${fail}`);
    }
  }));
} else {
  console.log("DRY-RUN：不落盘。批次=", chunks.length);
  process.exit(0);
}

// ── 4. 重建对象并落盘 ─────────────────────────────────
function rebuild(node: any, path: string[]): any {
  if (typeof node === "string") return results.get(path.join(".")) ?? node;
  if (Array.isArray(node)) return node.map((v, i) => rebuild(v, [...path, String(i)]));
  if (node && typeof node === "object") {
    const o: any = {};
    for (const k of Object.keys(node)) o[k] = rebuild(node[k], [...path, k]);
    return o;
  }
  return node;
}
const kaObj = rebuild(en, []);
const out = `// 格鲁吉亚语字典（程序生成自 en.ts，源叶子 ${leaves.length} 条，失败回落英文 ${fail} 条）\nexport const ka = ${JSON.stringify(kaObj, null, 2)};\n`;
fs.writeFileSync("src/i18n/ka.ts", out);
console.log(`DONE ka.ts bytes=${out.length} 失败回落=${fail}/${leaves.length}`);
process.exit(0);
