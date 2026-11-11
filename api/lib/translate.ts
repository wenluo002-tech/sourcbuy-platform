// 商品数据按需翻译：中文 → 买家语言，LLM 批量翻译一次、结果终身缓存（text_translations 表）。
// 纪律：翻译绝不阻塞页面——超时/失败一律回落原文；缓存优先，同一段文本终身只翻一次；
// SEO 堆词标题（如"跨境专供融蜡灯ins扩香礼品台灯…"）要求意译成自然品名，不是逐字机翻。
import { createHash } from "crypto";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getDb } from "../queries/connection";
import { sql } from "drizzle-orm";
import { log } from "./logger";

const kimiGw = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL!,
  apiKey: process.env.KIMI_AGENTGW_API_KEY!,
  supportsStructuredOutputs: true,
});

export const DATA_LANGS = ["en", "es", "fr", "pt", "de", "ja", "ar"] as const; // 数据层支持的目标语言（界面语言是其子集）
export type DataLang = (typeof DATA_LANGS)[number];

const LANG_NAME: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese", de: "German", ja: "Japanese", ar: "Arabic",
};

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  const db = await getDb();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS text_translations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    src_hash CHAR(64) NOT NULL,
    target_lang VARCHAR(8) NOT NULL,
    src_text TEXT NOT NULL,
    translated TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tt (src_hash, target_lang)
  )`);
  tableReady = true;
}

const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** 从模型输出里抠 JSON 数组（结构化输出在网关上慢 3.5 倍，故用裸文本+手动解析；抠不到数组返回 null） */
function parseJsonArray(text: string): string[] | null {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) && arr.every((x) => typeof x === "string") ? arr : null;
  } catch {
    return null;
  }
}

/**
 * 只查缓存不调 LLM——detailV2 的 SKU>8 分支用：已翻好的批次立刻替换显示（渐进变译文），
 * 缺失部分由调用方 fire-and-forget 调 translateTexts 补。
 */
export async function lookupCached(texts: string[], targetLang: string): Promise<Record<string, string>> {
  const clean = [...new Set(texts.map((s) => (s ?? "").trim()).filter(Boolean))];
  const out: Record<string, string> = {};
  if (!clean.length || targetLang === "zh" || !LANG_NAME[targetLang]) return out;
  try {
    await ensureTable();
    const db = await getDb();
    // 批量 IN 一次查完（逐条 SELECT 在 342 个 SKU 场景要 30s，不可接受）
    const hashToSrc = new Map(clean.map((t) => [hash(t), t]));
    const inList = sql.join([...hashToSrc.keys()].map((h) => sql`${h}`), sql`, `);
    const rows: any = await db.execute(
      sql`SELECT src_hash, translated FROM text_translations WHERE target_lang = ${targetLang} AND src_hash IN (${inList})`
    );
    for (const row of rows?.[0] ?? rows ?? []) {
      const src = hashToSrc.get(row.src_hash);
      if (src && row.translated) out[src] = row.translated;
    }
  } catch { /* 查缓存失败=没有缓存，静默回落原文 */ }
  return out;
}

/**
 * 批量翻译（缓存优先）。返回 原文→译文 的映射；任何失败都回落原文，绝不抛出。
 * 调用方自行保证 texts 是中文商品文本（标题/规格名）。
 */
export async function translateTexts(texts: string[], targetLang: string): Promise<Record<string, string>> {
  const clean = [...new Set(texts.map((s) => (s ?? "").trim()).filter(Boolean))];
  if (!clean.length || targetLang === "zh" || !LANG_NAME[targetLang]) return {};
  const out: Record<string, string> = {};
  try {
    await ensureTable();
    const db = await getDb();
    // 1) 查缓存（批量 IN，一次查完）
    const cached = await lookupCached(clean, targetLang);
    const missing: string[] = [];
    for (const t of clean) {
      if (cached[t]) out[t] = cached[t];
      else missing.push(t);
    }
    if (!missing.length) return out;
    // 2) 分批批量调 LLM（裸文本 JSON 数组进出——generateObject 结构化输出在网关上慢 3.5 倍，20 条要 18s 必超时）。
    //    20 条/批、3 路并发（40 条大批次在 30s 内经常出不来/条数错位整批丢弃；小批次成功率显著高）。
    const BATCH = 20;
    const chunks: string[][] = [];
    for (let b = 0; b < missing.length; b += BATCH) chunks.push(missing.slice(b, b + BATCH));
    let cursor = 0;
    const worker = async () => {
      while (cursor < chunks.length) {
        const chunk = chunks[cursor++];
        const batchNo = cursor;
        try {
          const r = await generateText({
            model: kimiGw("k2d8-preview"), // 翻译是轻量任务：快模型，thinking 版 10s 内出不来
            system: `You are a cross-border e-commerce localization translator. Translate Chinese product listing text into natural, buyer-facing ${LANG_NAME[targetLang]}.
Rules: produce a natural product name/description a native buyer would write — do NOT translate word-by-word; Chinese listings stack SEO keywords, compress them into one clean name. Keep brand names, model numbers, units and spec values as-is. Output a JSON array of exactly N strings in the same order, one per input. No explanations, no markdown fences.`,
            messages: [{ role: "user", content: JSON.stringify(chunk) }],
            abortSignal: AbortSignal.timeout(30_000),
          });
          const translated = parseJsonArray(r.text) ?? [];
          // 3) 入库（条数对齐才入库，错位整批回落原文）
          if (translated.length === chunk.length) {
            for (let i = 0; i < chunk.length; i++) {
              const t = chunk[i], tr = (translated[i] ?? "").trim();
              if (!tr) continue;
              out[t] = tr;
              await db.execute(
                sql`INSERT IGNORE INTO text_translations (src_hash, target_lang, src_text, translated) VALUES (${hash(t)}, ${targetLang}, ${t}, ${tr})`
              );
            }
            log.info("商品文本翻译入库", { lang: targetLang, n: chunk.length, batch: batchNo });
          } else {
            log.warn("翻译条数错位，本批回落原文", { lang: targetLang, want: chunk.length, got: translated.length });
          }
        } catch (e) {
          log.warn("本批翻译失败回落原文，继续下一批", { lang: targetLang, batch: batchNo, error: e instanceof Error ? e.message : String(e) });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return out;
  } catch (e) {
    log.warn("翻译失败回落原文", { lang: targetLang, error: e instanceof Error ? e.message : String(e) });
    return out; // 已命中的缓存照常返回
  }
}

/**
 * 输出层翻译助手（数据层接口统一模式）：
 *   lookupCached 同步替换已缓存译文（快路径，响应绝不被翻译阻塞）；
 *   未缓存部分 fire-and-forget 调 translateTexts 后台补——下次请求/巡检预热后命中。
 * rows: 数据行数组；fields: 要翻译的字段名（值可为 string 或 string[]，数组逐项映射）；
 * locale: 目标语言（zh/空 = 原样返回）。返回是否已做替换（仅日志用）。
 */
export async function translateFields<T extends Record<string, any>>(
  rows: T[],
  fields: (keyof T & string)[],
  locale?: string | null
): Promise<boolean> {
  if (!locale || locale === "zh" || !LANG_NAME[locale] || !rows.length) return false;
  const texts: string[] = [];
  for (const r of rows) {
    for (const f of fields) {
      const v = r[f];
      if (typeof v === "string" && v.trim()) texts.push(v);
      else if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && x.trim()) texts.push(x);
    }
  }
  if (!texts.length) return false;
  const map = await lookupCached(texts, locale); // 只查缓存不调 LLM，快路径
  let replaced = false;
  for (const r of rows) {
    for (const f of fields) {
      const v = r[f];
      if (typeof v === "string" && map[v]) {
        r[f] = map[v] as any;
        replaced = true;
      } else if (Array.isArray(v)) {
        const nv = v.map((x) => (typeof x === "string" && map[x] ? map[x] : x));
        if (nv.some((x, i) => x !== v[i])) {
          r[f] = nv as any;
          replaced = true;
        }
      }
    }
  }
  const missing = [...new Set(texts.filter((t) => !map[t]))];
  if (missing.length) {
    // fire-and-forget：后台补缺铺满终身缓存，绝不 await 阻塞响应
    void translateTexts(missing, locale).catch(() => {});
  }
  return replaced;
}
