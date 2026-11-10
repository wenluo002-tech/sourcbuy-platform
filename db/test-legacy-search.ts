process.loadEnvFile();
import { legacySearchItems, legacyLinkedFactories, searchOffers } from "../api/sourcing/offerService";

for (const w of ["衣架", "保温杯", "LED"]) {
  const t0 = Date.now();
  const items = await legacySearchItems(w, 8);
  const t1 = Date.now();
  const linked = await legacyLinkedFactories(w, 3);
  console.log(`${w}: items=${items.length} (${t1 - t0}ms) linked=${linked.length} (${Date.now() - t1}ms)`);
  if (linked[0]) console.log("  首位严选:", linked[0].factory.name.slice(0, 20), "| 货:", linked[0].title.slice(0, 24), "¥" + linked[0].price);
}
// searchOffers 集成实测：选一个产品池大概率没有的词
const r = await searchOffers("机械式温控器", 1);
console.log("searchOffers 机械式温控器:", r.items.length, "条 source=" + r.source);
process.exit(0);
