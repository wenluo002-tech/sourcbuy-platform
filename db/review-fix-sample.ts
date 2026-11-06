process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  for (const kw of ["多场景实拍图", "大门、车间", "有场景实拍"]) {
    const [rows] = await db.execute(sql`
      SELECT id, review FROM factories
      WHERE (images IS NULL OR JSON_SEARCH(images, 'one', 'http%') IS NULL)
        AND review LIKE ${'%' + kw + '%'} LIMIT 2`) as any;
    for (const r of rows as any[]) console.log(`#${r.id}:`, r.review, "\n---");
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
