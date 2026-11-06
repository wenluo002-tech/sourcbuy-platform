// 盘点：图死但 review 仍提"实拍图"的工厂
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  // 图全死（images 不含 http 绝对链）但 review 提到实拍
  const [rows] = await db.execute(sql`
    SELECT id, review FROM factories
    WHERE (images IS NULL OR JSON_SEARCH(images, 'one', 'http%') IS NULL)
      AND review LIKE '%实拍%'`) as any;
  console.log("图死但提实拍的厂:", rows.length, "家");
  // 提取所有含"实拍"的句子，看句式有几种
  const patterns = new Map<string, number>();
  for (const r of rows as any[]) {
    const sentences = String(r.review).split(/[。；;]/);
    for (const s of sentences) {
      if (s.includes("实拍")) {
        const key = s.trim().slice(0, 50);
        patterns.set(key, (patterns.get(key) ?? 0) + 1);
      }
    }
  }
  console.log("\n句式分布:");
  for (const [k, n] of [...patterns.entries()].sort((a, b) => b[1] - a[1])) console.log(`  [${n}次] ${k}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
