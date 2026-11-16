// ka 雷达/页面数据缓存直灌：从扫描日志提取中文残留 → LLM 翻格鲁吉亚语 → 入 text_translations
// 用法：npx tsx db/gen-ka-cache.ts /tmp/scan2.log
process.loadEnvFile();
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createHash } from "crypto";
import fs from "node:fs";
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const kimiGw = createOpenAICompatible({ name: "kimi-gw", baseURL: process.env.KIMI_AGENTGW_BASE_URL!, apiKey: process.env.KIMI_AGENTGW_API_KEY! });
const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// 1. 从扫描日志提取残留行（"残留 N 处：" 之后的缩进行，直到空行或下一标记）
const logText = fs.readFileSync(process.argv[2] ?? "/tmp/scan2.log", "utf8");
const CJK = /[一-鿿]/;
const texts = new Set<string>();
for (const line of logText.split("\n")) {
  const t = line.trim();
  if (t && CJK.test(t) && !line.startsWith("✗") && !line.startsWith("…") && !line.includes("残留")) texts.add(t);
}
console.log("提取中文残留文本:", texts.size, "条");

const db = await getDb();
// 2. 过滤已在缓存的
const missing: string[] = [];
for (const t of texts) {
  const [r]: any = await db.execute(sql`SELECT 1 FROM text_translations WHERE target_lang='ka' AND src_hash=${hash(t)} LIMIT 1`);
  const rows = Array.isArray(r) ? r : [];
  if (!rows.length) missing.push(t);
}
console.log("缓存缺失:", missing.length, "条");
if (!missing.length) { console.log("CACHE_DONE"); process.exit(0); }

// 3. 批量翻译入库（5 条/批，90s 超时——长文本慢，宁可稳）
let ok = 0;
for (let i = 0; i < missing.length; i += 5) {
  const chunk = missing.slice(i, i + 5);
  try {
    const r = await generateText({
      model: kimiGw("k2d8-preview"),
      system: `You are a professional localization translator for a cross-border B2B sourcing platform. Translate the following Chinese sourcing/radar commentary into natural, concise Georgian (ქართული) for overseas SME buyers. Output a JSON array of exactly ${chunk.length} strings, same order. Keep brand names, numbers, units, certifications (UL/ETL/NSF/FDA), and platform names (Amazon/TikTok) as-is or transliterated naturally. ZERO Chinese characters. No explanations, no markdown fences.`,
      messages: [{ role: "user", content: JSON.stringify(chunk) }],
      abortSignal: AbortSignal.timeout(90_000),
    });
    const m = r.text.match(/\[[\s\S]*\]/);
    const arr: string[] = m ? JSON.parse(m[0]) : [];
    if (arr.length === chunk.length) {
      for (let j = 0; j < chunk.length; j++) {
        const tr = String(arr[j] ?? "").trim();
        if (tr && !CJK.test(tr)) {
          await db.execute(sql`INSERT IGNORE INTO text_translations (src_hash, target_lang, src_text, translated) VALUES (${hash(chunk[j])}, 'ka', ${chunk[j]}, ${tr})`);
          ok++;
        }
      }
    } else console.log("批错位", chunk.length, arr.length);
  } catch (e) { console.log("批异常:", e instanceof Error ? e.message : e); }
  console.log(`进度 ${Math.min(i + 5, missing.length)}/${missing.length} 入库=${ok}`);
}
console.log("CACHE_DONE ok=", ok);
process.exit(0);
