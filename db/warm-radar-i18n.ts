/**
 * 雷达文案翻译预热（V109 根因修复）：
 * radar.list 路由的 translateFields 是「缓存命中即换、miss fire-and-forget」——
 * 雷达文案从未进过缓存（实测五语言 0/48），小语种买家一直看中文 signalText。
 * 本脚本把 active 雷达条的 title/signal_text/note 一次 await 铺满五语言终身缓存。
 * 跑法：npx tsx db/warm-radar-i18n.ts
 * 时机：雷达周更上新文案后必跑一次（否则新文案在缓存铺满前对外露中文）。
 */
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { translateTexts } from "../api/lib/translate";

const LANGS = ["en", "es", "fr", "pt", "ka"];

(async () => {
  const db = await getDb();
  const rows: any = await db.execute(
    sql.raw("SELECT title, signal_text, note FROM radar_items WHERE active=1")
  );
  const texts = [
    ...new Set(
      (rows[0] ?? rows)
        .flatMap((r: any) => [r.title, r.signal_text, r.note])
        .filter((t: any) => typeof t === "string" && t.trim())
    ),
  ] as string[];
  console.log(`待译文本 ${texts.length} 条 × ${LANGS.length} 语言`);
  for (const lang of LANGS) {
    await translateTexts(texts, lang); // 纪律：await 铺满，绝不 fire-and-forget
    console.log(`${lang} 完成`);
  }
  console.log("雷达文案五语言缓存已铺满");
  process.exit(0);
})().catch((e) => {
  console.error("预热失败", e);
  process.exit(1);
});
