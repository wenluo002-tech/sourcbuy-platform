// 复现「液晶电视」搜索结果：看三个召回层各自给出什么
process.loadEnvFile();
import { poolSearch, legacySearchItems, searchOffers } from "../api/sourcing/offerService";

const q = "液晶电视";
const pool = await poolSearch(q, 8);
const legacy = await legacySearchItems(q, 8);
console.log("=== poolSearch ===");
for (const i of pool) console.log(`[pool] ${i.title.slice(0, 44)} | ¥${i.price} | 销量${i.sales}`);
console.log("=== legacySearch ===");
for (const i of legacy) console.log(`[legacy] ${i.title.slice(0, 44)} | ¥${i.price}`);
// searchOffers 第一页（可能走缓存/池/万邦）
const r = await searchOffers(q, 1);
console.log(`=== searchOffers (source=${r.source}) ===`);
for (const i of r.items) console.log(`[${r.source}] ${i.title.slice(0, 44)} | ¥${i.price} | 销量${i.sales}`);
process.exit(0);
