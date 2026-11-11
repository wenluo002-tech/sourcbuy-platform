import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
const d = getDb();
const r: any = await d.execute(sql`SELECT target_lang, src_text, translated FROM text_translations WHERE src_text LIKE '%TikTok%' AND target_lang IN ('en','es','fr','pt')`);
for (const row of (r?.[0] ?? r)) console.log(`[${row.target_lang}] ${row.translated}\n`);
process.exit(0);
