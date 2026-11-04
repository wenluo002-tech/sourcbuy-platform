// 模拟 aiSourcing 真实链路:poolSearch 候选 → linkTopOffersToFactories
process.loadEnvFile();
import { poolSearch, linkTopOffersToFactories } from "../api/sourcing/offerService";
async function main() {
  for (const q of ["衣架", "蓝牙耳机", "保温杯", "瑜伽裤"]) {
    const t0 = Date.now();
    const pooled = await poolSearch(q, 20);
    const linked = await linkTopOffersToFactories(pooled, 3);
    console.log(`[${q}] 池候选 ${pooled.length} 条, 以货带厂 ${linked.length} 家 (${Date.now() - t0}ms)`);
    for (const l of linked) console.log(`  ★ ${l.factory.name} [${l.factory.tier}/${l.factory.score}分] 在售「${l.title.slice(0, 26)}」¥${l.price} 销${l.sales}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
