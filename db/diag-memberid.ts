// 排查 1: join key 格式比对 2: item_search 原始返回是否带卖家字段
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const [pool]: any = await db.execute(sql`SELECT offer_id, member_id FROM offer_pool WHERE member_id IS NOT NULL LIMIT 9`);
  console.log("池子详情的 memberId:");
  for (const r of pool) console.log(" ", r.offer_id, "->", r.member_id);
  const [fac]: any = await db.execute(sql`SELECT member_id, name, home FROM factories LIMIT 5`);
  console.log("\nfactories.member_id 样本:");
  for (const r of fac) console.log(" ", r.member_id, "|", r.name, "|", String(r.home).slice(0, 60));
  // 这 9 个 memberId 有没有任何一个在 factories 里（大小写不敏感也试）
  const [hit]: any = await db.execute(
    sql`SELECT COUNT(*) c FROM offer_pool p JOIN factories f ON LOWER(f.member_id) = LOWER(p.member_id) WHERE p.member_id IS NOT NULL`,
  );
  console.log("\n大小写不敏感 join 命中:", hit[0].c);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
