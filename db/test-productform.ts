// v79 整机/配件区分 验收：单元 + 集成（真实 DB + 最多一次万邦实时搜索）
process.loadEnvFile();
import { looksLikeAccessory, queryWantsAccessory, prioritizeWholeMachines } from "../contracts/productForm";
import { expandQuery } from "../contracts/lexicon";
import { poolSearch, legacySearchItems, searchOffers } from "../api/sourcing/offerService";
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra?: string) => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? " — " + extra : ""}`); }
};

// ── 单元：八个肇事标题必须全部判配件 ──
const offenders = [
  "电视机防尘罩新款家用液晶电视罩子盖布55寸65挂式开机不取电视套",
  "LVDS数据线生产液晶电视连接线4K高清屏线编织层保护41P对41P线束",
  "泉州品牌 AECJ 50*90 4欧5瓦智能蓝牙液晶电视长方形纸盆喇叭",
  "PHB 2.0mm 双排液晶电视专用条形连接器针座胶壳端子经久耐用",
  "品牌 AEC 50*90矩形4欧5瓦智能蓝牙液晶电视长方形纸盆喇叭",
  "新款简约高档液晶电视机罩套电视罩防尘罩子挂式曲面6575寸盖布巾",
  "批发 开机不取电视罩防尘罩蕾丝绣花纱液晶电视机套罩厂家",
  "kg跨境代发液晶电视机罩通用防尘罩套现代简约挂式电视机85英寸",
  "加高防水高抗压瓦楞蜂窝板箱液晶电视包装箱可尺寸颜色中空板pp",
];
ok(offenders.every((t) => looksLikeAccessory(t)), "肇事配件标题全部判配件", offenders.filter((t) => !looksLikeAccessory(t)).join("/"));

// ── 单元：整机标题必须判整机 ──
const wholeTvs = [
  "智能网络语音液晶电视机wifi小咪电视32/50/55/65/75寸曲面4K42",
  "厂家批发电视机75/55寸4K高清电视32寸智能网络电视机LED液晶电视",
  "55寸液晶电视机4k高清智能wifi平板32网络wifi60/65寸50酒店工程",
  "32英寸电视机高清智能网络平板液晶电视机家用彩电",
];
ok(wholeTvs.every((t) => !looksLikeAccessory(t)), "整机电视标题全部判整机", wholeTvs.filter((t) => looksLikeAccessory(t)).join("/"));

// ── 单元：查询意图判定 ──
ok(!queryWantsAccessory("液晶电视"), "搜「液晶电视」=要整机");
ok(queryWantsAccessory("电视罩"), "搜「电视罩」=要配件（不触发整机优先）");
ok(queryWantsAccessory("液晶电视连接线"), "搜「液晶电视连接线」=要配件");
ok(queryWantsAccessory("电视柜"), "搜「电视柜」命中同名异物词→不触发整机优先（柜子自然排前，正确）");

// ── 单元：词库类目归属（防「电视柜」被电子数码劫持的回归）──
ok(expandQuery("液晶电视").category === "电子数码", "「液晶电视」归电子数码桶");
ok(expandQuery("电视柜").category === "家具", "「电视柜」仍归家具桶", String(expandQuery("电视柜").category));

// ── 单元：排序——整机在前配件沉底，原数组不被改写 ──
const mixed = [{ title: "液晶电视防尘罩" }, { title: "55寸液晶电视机4K智能" }, { title: "液晶电视挂架" }, { title: "32寸高清平板电视机" }];
const ranked = prioritizeWholeMachines("液晶电视", mixed);
ok(!looksLikeAccessory(ranked[0].title) && !looksLikeAccessory(ranked[1].title), "排序：整机占据前两位");
ok(mixed[0].title === "液晶电视防尘罩", "排序不改写原数组");
const keepAsIs = prioritizeWholeMachines("电视罩", mixed);
ok(keepAsIs[0].title === "液晶电视防尘罩", "搜配件词时原序不动");

// ── 集成：清掉修复前的旧缓存（否则 30min 内还是旧结果）──
await getDb().execute(dsql`DELETE FROM offer_search_cache WHERE query = '液晶电视'`);

// ── 集成：legacy 召回整机优先（硬指标：真整机"55寸液晶电视机"必须进前 3）──
const legacy = await legacySearchItems("液晶电视", 8);
console.log("legacy top:", legacy.map((i) => i.title.slice(0, 22)).join(" | "));
const legacyWhole = legacy.filter((i) => !looksLikeAccessory(i.title));
ok(legacy.length > 0 && legacy.slice(0, legacyWhole.length).every((i) => !looksLikeAccessory(i.title)), "legacy：整机全部排在配件前");
ok(legacy.slice(0, 3).some((i) => i.title.includes("液晶电视机") && /\d{2}\s*寸|英寸/.test(i.title) && !looksLikeAccessory(i.title)), "legacy：真整机电视机进前 3");

// ── 集成：searchOffers 第一页 top8 整机 ≥6（不足会实时上万邦补，一次 ¥0.022）──
const r = await searchOffers("液晶电视", 1);
const whole8 = r.items.filter((i) => !looksLikeAccessory(i.title));
console.log(`searchOffers source=${r.source} top8:`);
for (const i of r.items) console.log(`  ${looksLikeAccessory(i.title) ? "[配件]" : "[整机]"} ${i.title.slice(0, 40)} ¥${i.price}`);
ok(whole8.length >= 6, "searchOffers top8 整机 ≥6", `整机 ${whole8.length}/8`);
ok(r.items.slice(0, whole8.length).every((i) => !looksLikeAccessory(i.title)), "searchOffers：整机全部在配件前");

// ── 集成：配件词不受误伤 ──
const acc = await searchOffers("电视罩", 1);
ok(acc.items.length > 0, "搜「电视罩」仍有结果", `共 ${acc.items.length} 条`);

// ── 集成：poolSearch 同口径 ──
const pool = await poolSearch("液晶电视", 20);
if (pool.length) {
  const pw = pool.filter((i) => !looksLikeAccessory(i.title));
  ok(pool.slice(0, pw.length).every((i) => !looksLikeAccessory(i.title)), "poolSearch：整机全部在配件前");
} else {
  ok(true, "poolSearch：池空跳过（万邦回填后自然生效）");
}

console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
