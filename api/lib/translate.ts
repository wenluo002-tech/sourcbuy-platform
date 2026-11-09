// 商品数据按需翻译：中文 → 买家语言，LLM 批量翻译一次、结果终身缓存（text_translations 表）。
// 纪律：翻译绝不阻塞页面——超时/失败一律回落原文；缓存优先，同一段文本终身只翻一次；
// SEO 堆词标题（如"跨境专供融蜡灯ins扩香礼品台灯…"）要求意译成自然品名，不是逐字机翻。
import { createHash } from "crypto";
import { generateObject } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
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

const batchSchema = z.object({ translations: z.array(z.string()) });

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
    // 1) 查缓存
    const missing: string[] = [];
    for (const t of clean) {
      const h = hash(t);
      const rows: any = await db.execute(
        sql`SELECT translated FROM text_translations WHERE src_hash = ${h} AND target_lang = ${targetLang} LIMIT 1`
      );
      const hit = rows?.[0]?.[0]?.translated ?? rows?.[0]?.translated;
      if (hit) out[t] = hit;
      else missing.push(t);
    }
    if (!missing.length) return out;
    // 2) 批量调 LLM（一次调用翻整批，JSON 数组进出）
    const r = await generateObject({
      model: kimiGw("k2d8-preview"), // 翻译是轻量任务：快模型，thinking 版 10s 内出不来
      system: `You are a cross-border e-commerce localization translator. Translate Chinese product listing text into natural, buyer-facing ${LANG_NAME[targetLang]}.
Rules: produce a natural product name/description a native buyer would write — do NOT translate word-by-word; Chinese listings stack SEO keywords, compress them into one clean name. Keep brand names, model numbers, units and spec values as-is. Output exactly N strings in the same order, one per input. No explanations.`,
      messages: [{ role: "user", content: JSON.stringify(missing) }],
      schema: batchSchema,
      abortSignal: AbortSignal.timeout(15_000),
    });
    const translated = r.object.translations;
    // 3) 入库（条数对齐才入库，错位整批回落原文）
    if (translated.length === missing.length) {
      for (let i = 0; i < missing.length; i++) {
        const t = missing[i], tr = (translated[i] ?? "").trim();
        if (!tr) continue;
        out[t] = tr;
        await db.execute(
          sql`INSERT IGNORE INTO text_translations (src_hash, target_lang, src_text, translated) VALUES (${hash(t)}, ${targetLang}, ${t}, ${tr})`
        );
      }
      log.info("商品文本翻译入库", { lang: targetLang, n: missing.length });
    } else {
      log.warn("翻译条数错位，整批回落原文", { lang: targetLang, want: missing.length, got: translated.length });
    }
    return out;
  } catch (e) {
    log.warn("翻译失败回落原文", { lang: targetLang, error: e instanceof Error ? e.message : String(e) });
    return out; // 已命中的缓存照常返回
  }
}
