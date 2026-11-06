// 死图厂 review 修复：图已不可恢复（v54 结论），话术里承诺"有实拍图"=撒谎，整句摘除
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const dead = `(images IS NULL OR JSON_SEARCH(images, 'one', 'http%') IS NULL)`;
  const fixes = [
    ["；多场景实拍图，便于远程判断工厂真实度。", "。"],
    ["；大门、车间、设备、仓库实拍齐全，可远程初步验厂。", "。"],
    ["；有场景实拍可供参考。", "，"],
  ];
  for (const [from, to] of fixes) {
    const [r]: any = await db.execute(sql`
      UPDATE factories SET review = REPLACE(review, ${from}, ${to})
      WHERE review LIKE ${'%' + from + '%'} AND ${sql.raw(dead)}`);
    console.log(`摘除「${from.slice(1, 12)}…」:`, r.affectedRows ?? r[0]?.affectedRows, "家");
  }
  // 验证：死图厂还有提实拍的吗
  const [left] = await db.execute(sql`
    SELECT COUNT(*) AS c FROM factories WHERE ${sql.raw(dead)} AND review LIKE '%实拍%'`) as any;
  console.log("残留:", left[0].c);
  const [s] = await db.execute(sql`SELECT review FROM factories WHERE id = 4`) as any;
  console.log("\n修复后样例:", s[0].review);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
