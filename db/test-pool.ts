// v48 产品池 + 以货带厂链路验证
import { searchOffers, linkTopOffersToFactories } from "../api/sourcing/offerService";
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const [poolCnt]: any = await db.execute(sql`SELECT COUNT(*) c, COUNT(member_id) m FROM offer_pool`);
  console.log(`产品池: ${poolCnt[0].c} 条, 其中已挂 memberId ${poolCnt[0].m} 条`);

  for (const q of ["衣架", "蓝牙耳机", "保温杯"]) {
    const t0 = Date.now();
    const r = await searchOffers(q, 1);
    console.log(`\n[${q}] source=${r.source} items=${r.items.length} ${Date.now() - t0}ms`);
    for (const it of r.items.slice(0, 3)) console.log(`  ${it.offerId} ¥${it.promotionPrice ?? it.price} 销${it.sales} ${it.title.slice(0, 30)}`);

    const lt = Date.now();
    const linked = await linkTopOffersToFactories(r.items, 3);
    console.log(`  以货带厂: ${linked.length} 家命中严选库 (${Date.now() - lt}ms)`);
    for (const l of linked) console.log(`    ★ ${l.factory.name} [${l.factory.tier}/${l.factory.score}分] 在售「${l.title.slice(0, 24)}」¥${l.price} 销${l.sales}`);
  }
  const [poolCnt2]: any = await db.execute(sql`SELECT COUNT(*) c, COUNT(member_id) m FROM offer_pool`);
  console.log(`\n跑完后产品池: ${poolCnt2[0].c} 条, 挂 memberId ${poolCnt2[0].m} 条`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
