import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
const d = getDb();
const t = "金标严选 · 16 年老厂 · 复购率 85% · 第三方认证";
const h = createHash("sha256").update(t, "utf8").digest("hex");
for (const lang of ["en", "es", "fr", "pt"]) {
  const r: any = await d.execute(sql`SELECT translated FROM text_translations WHERE src_hash=${h} AND target_lang=${lang}`);
  const row = (r?.[0] ?? r)?.[0];
  console.log(lang, "=>", row ? row.translated : "(无缓存)");
}
process.exit(0);
