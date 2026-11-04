// 三键口径统计（纯JS内存匹配，秒级）+ 新品类以货带厂验证
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { poolSearch, linkTopOffersToFactories } from "../api/sourcing/offerService";
const db = getDb();
const [prows]: any = await db.execute(sql`SELECT offer_id offerId, member_id memberId, seller_login_id loginId, seller_user_id uid FROM offer_pool`);
const [frows]: any = await db.execute(sql`SELECT id, name, member_id memberId FROM factories`);
const byKey = new Map(frows.map((f: any) => [f.memberId, f]));
const b2b = frows.filter((f: any) => f.memberId?.startsWith("b2b-"));
let hits = 0; const facSet = new Set<number>();
for (const p of prows) {
  let f: any = null;
  if (p.memberId && byKey.has(p.memberId)) f = byKey.get(p.memberId);
  else if (p.loginId && byKey.has(p.loginId)) f = byKey.get(p.loginId);
  else if (p.uid) f = b2b.find((x: any) => x.memberId.startsWith(`b2b-${p.uid}`));
  if (f) { hits++; facSet.add(f.id); }
}
console.log(`池 ${prows.length} 条 → 严选厂在册货 ${hits} 条，覆盖严选厂 ${facSet.size} 家 / 库${frows.length}家`);
console.log("\n--- 新品类以货带厂验证 ---");
for (const q of ["宠物窝", "办公椅", "吸顶灯", "登山包", "保鲜盒", "螺丝刀"]) {
  const pooled = await poolSearch(q, 20);
  const linked = await linkTopOffersToFactories(pooled, 3);
  if (linked.length) {
    const s = linked.map((l: any) => `${l.factory.name}(${l.factory.score})「${l.title.slice(0,12)}」¥${l.price}销${l.sales}`).join(" | ");
    console.log(`${q}: ✓${linked.length}家 ${s}`);
  } else console.log(`${q}: ✗ 0命中`);
}
process.exit(0);
