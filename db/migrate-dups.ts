// 同一公司多店铺账号去重：同名（公司全名相同）视为同一公司，保留最高分店铺，其余 dup_of 指向保留者
// 幂等：可重复执行。2026-11-06 深度体检发现 28 组（xixi品牌专营店×2、广州欧博×3 等）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  // 1) 加列（幂等）
  const [cols] = await db.execute(sql`SHOW COLUMNS FROM factories LIKE 'dup_of'`) as any;
  if ((cols as any[]).length === 0) {
    await db.execute(sql`ALTER TABLE factories ADD COLUMN dup_of BIGINT UNSIGNED NULL`);
    console.log("已加列 dup_of");
  } else console.log("dup_of 已存在");
  // 2) 找同名组，保留最高分（平分保留最小 id）
  const [groups] = await db.execute(sql`
    SELECT name FROM factories GROUP BY name HAVING COUNT(*)>1`) as any;
  let hidden = 0;
  for (const g of groups as any[]) {
    const [rows] = await db.execute(
      sql`SELECT id, score FROM factories WHERE name=${g.name} ORDER BY CAST(score AS DECIMAL(5,2)) DESC, id ASC`) as any;
    const keep = (rows as any[])[0];
    for (const r of (rows as any[]).slice(1)) {
      await db.execute(sql`UPDATE factories SET dup_of=${keep.id} WHERE id=${r.id} AND (dup_of IS NULL OR dup_of<>${keep.id})`);
      hidden++;
    }
    // 保留者自身的 dup_of 确保为 NULL
    await db.execute(sql`UPDATE factories SET dup_of=NULL WHERE id=${keep.id}`);
  }
  const [chk] = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE dup_of IS NOT NULL`) as any;
  console.log(`同名组 ${(groups as any[]).length} 个，本次隐藏 ${hidden} 条，dup_of 非空合计 ${(chk as any[])[0].c} 条`);
  process.exit(0);
}
main();
