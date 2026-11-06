// M4：从 factories.images 的 alicdn URL "!!{userId}-" 零成本提取 seller_user_id 回填
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const [rows] = await db.execute(sql`SELECT id, member_id, images FROM factories`) as any;
  let updated = 0, fromImages = 0, fromB2bPure = 0, skipped = 0;
  const stmts: Promise<any>[] = [];
  for (const f of rows as any[]) {
    if (f.seller_user_id) continue;
    let uid: string | null = null;
    // 路径1：images JSON 里所有 URL 找 !!数字-
    if (f.images) {
      const s = typeof f.images === "string" ? f.images : JSON.stringify(f.images);
      const m = s.match(/!!(\d{6,12})-/);
      if (m && !m[1].startsWith("461168")) { uid = m[1]; fromImages++; } // 461168 开头是图床内部 id（教训）
    }
    // 路径2：member_id 为纯数字 b2b（b2b-22076745039027d01b 这种带 hex 的不敢拆，跳过；纯数字可直取）
    if (!uid && f.member_id && /^b2b-(\d{6,12})$/.test(f.member_id)) {
      uid = f.member_id.slice(4); fromB2bPure++;
    }
    if (uid) {
      stmts.push(db.execute(sql`UPDATE factories SET seller_user_id = ${uid} WHERE id = ${f.id} AND (seller_user_id IS NULL OR seller_user_id = '')`));
      updated++;
    } else skipped++;
  }
  // 分批执行避免连接打爆
  for (let i = 0; i < stmts.length; i += 200) await Promise.all(stmts.slice(i, i + 200));
  console.log(`回填完成: ${updated} 家（图链提取 ${fromImages} + 纯数字 b2b ${fromB2bPure}），无法提取 ${skipped} 家`);
  const [c] = await db.execute(sql`
    SELECT COUNT(DISTINCT f.id) AS c FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)
      AND f.seller_user_id IS NOT NULL AND f.seller_user_id != ''
      AND EXISTS (SELECT 1 FROM offer_pool p WHERE p.seller_user_id = f.seller_user_id)`) as any;
  console.log("回填后未打标厂命中产品池:", c[0].c, "家");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
